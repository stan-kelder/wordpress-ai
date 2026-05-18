<?php
/**
 * Plugin Name: WordPress AI Connector
 * Plugin URI:  https://wordpress-ai.app
 * Description: Connects your WordPress site to the WordPress AI cloud platform for natural language management.
 * Version:     1.0.0
 * Author:      WordPress AI
 * License:     GPL-2.0-or-later
 * Text Domain: wordpress-ai-connector
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'WORDPRESS_AI_API_KEY', '{{API_KEY}}' );
define( 'WORDPRESS_AI_CLOUD_URL', '{{CLOUD_URL}}' );

function wordpress_ai_validate_api_key( WP_REST_Request $request ): bool {
    $auth = $request->get_header( 'Authorization' );
    if ( ! $auth ) {
        return false;
    }
    if ( strncmp( $auth, 'Bearer ', 7 ) !== 0 ) {
        return false;
    }
    $token = substr( $auth, 7 );
    return hash_equals( WORDPRESS_AI_API_KEY, $token );
}

function wordpress_ai_permission_callback( WP_REST_Request $request ) {
    if ( ! wordpress_ai_validate_api_key( $request ) ) {
        return new WP_Error(
            'rest_forbidden',
            'Invalid or missing API key.',
            array( 'status' => 401 )
        );
    }
    return true;
}

function wordpress_ai_register_routes(): void {
    $namespace = 'wordpress-ai/v1';

    register_rest_route(
        $namespace,
        '/ping',
        array(
            'methods'             => 'GET',
            'callback'            => 'wordpress_ai_ping',
            'permission_callback' => 'wordpress_ai_permission_callback',
        )
    );

    register_rest_route(
        $namespace,
        '/query',
        array(
            'methods'             => 'GET',
            'callback'            => 'wordpress_ai_query',
            'permission_callback' => 'wordpress_ai_permission_callback',
        )
    );

    register_rest_route(
        $namespace,
        '/execute',
        array(
            'methods'             => 'POST',
            'callback'            => 'wordpress_ai_execute',
            'permission_callback' => 'wordpress_ai_permission_callback',
        )
    );

    register_rest_route(
        $namespace,
        '/backup',
        array(
            'methods'             => 'POST',
            'callback'            => 'wordpress_ai_backup',
            'permission_callback' => 'wordpress_ai_permission_callback',
        )
    );
}
add_action( 'rest_api_init', 'wordpress_ai_register_routes' );

function wordpress_ai_ping(): WP_REST_Response {
    return new WP_REST_Response(
        array(
            'status' => 'connected',
            'site'   => get_bloginfo( 'name' ),
        ),
        200
    );
}

function wordpress_ai_resolve_wp_content_path( string $relative_path ) {
    $relative_path = ltrim( $relative_path, '/' );

    $wp_content_real = realpath( WP_CONTENT_DIR );
    if ( false === $wp_content_real ) {
        return false;
    }

    if ( strpos( $relative_path, 'wp-content/' ) === 0 ) {
        $abspath_real = realpath( ABSPATH );
        if ( false === $abspath_real ) {
            return false;
        }
        $candidate = $abspath_real . DIRECTORY_SEPARATOR . $relative_path;
    } else {
        $candidate = $wp_content_real . DIRECTORY_SEPARATOR . $relative_path;
    }

    $parent     = dirname( $candidate );
    $basename   = basename( $candidate );
    $parent_real = realpath( $parent );

    if ( false === $parent_real ) {
        return false;
    }

    $full = $parent_real . DIRECTORY_SEPARATOR . $basename;

    if ( strpos( $full, $wp_content_real . DIRECTORY_SEPARATOR ) !== 0 && $full !== $wp_content_real ) {
        return false;
    }

    return $full;
}

function wordpress_ai_query( WP_REST_Request $request ): WP_REST_Response {
    $tool = $request->get_param( 'tool' );

    if ( 'read_file' === $tool ) {
        $path = (string) $request->get_param( 'path' );

        if ( '' === $path ) {
            return new WP_REST_Response( array( 'error' => 'path is required.' ), 400 );
        }

        $normalized = ltrim( $path, '/' );

        if ( 'wp-config.php' === $normalized ) {
            $abspath_real = realpath( ABSPATH );
            if ( false === $abspath_real ) {
                return new WP_REST_Response( array( 'error' => 'Could not resolve ABSPATH.' ), 500 );
            }
            $full = $abspath_real . DIRECTORY_SEPARATOR . 'wp-config.php';
        } else {
            $full = wordpress_ai_resolve_wp_content_path( $normalized );
            if ( false === $full ) {
                return new WP_REST_Response( array( 'error' => 'Path outside allowed scope' ), 403 );
            }
        }

        if ( ! file_exists( $full ) || ! is_file( $full ) ) {
            return new WP_REST_Response( array( 'error' => 'File not found.' ), 404 );
        }

        $content = file_get_contents( $full );
        if ( false === $content ) {
            return new WP_REST_Response( array( 'error' => 'Could not read file.' ), 500 );
        }

        return new WP_REST_Response(
            array(
                'path'    => $normalized,
                'content' => $content,
                'size'    => strlen( $content ),
            ),
            200
        );
    }

    if ( 'fetch_url' === $tool ) {
        $path = (string) $request->get_param( 'path' );

        if ( '' === $path ) {
            return new WP_REST_Response( array( 'error' => 'path is required.' ), 400 );
        }

        $site_host = wp_parse_url( site_url(), PHP_URL_HOST );

        if ( preg_match( '#^https?://#i', $path ) ) {
            $target_host = wp_parse_url( $path, PHP_URL_HOST );
            if ( ! $target_host || strcasecmp( $target_host, (string) $site_host ) !== 0 ) {
                return new WP_REST_Response( array( 'error' => 'URL must be on the same site.' ), 403 );
            }
            $url = $path;
        } else {
            $url = rtrim( site_url(), '/' ) . '/' . ltrim( $path, '/' );
        }

        $response = wp_remote_get( $url, array( 'timeout' => 15, 'sslverify' => false ) );

        if ( is_wp_error( $response ) ) {
            return new WP_REST_Response( array( 'error' => $response->get_error_message() ), 500 );
        }

        $status = wp_remote_retrieve_response_code( $response );
        $body   = (string) wp_remote_retrieve_body( $response );

        $max = 100 * 1024;
        if ( strlen( $body ) > $max ) {
            $body = substr( $body, 0, $max ) . "\n\n[truncated at 100KB]";
        }

        return new WP_REST_Response(
            array(
                'url'    => $url,
                'status' => (int) $status,
                'body'   => $body,
            ),
            200
        );
    }

    return new WP_REST_Response(
        array( 'error' => 'Unknown tool: ' . $tool ),
        400
    );
}

function wordpress_ai_execute( WP_REST_Request $request ): WP_REST_Response {
    $body = $request->get_json_params();

    if ( empty( $body['action'] ) ) {
        return new WP_REST_Response(
            array( 'error' => 'Missing action in request body.' ),
            400
        );
    }

    $action = $body['action'];
    $params = isset( $body['params'] ) && is_array( $body['params'] )
        ? $body['params']
        : array();

    if ( 'execute_php' === $action ) {
        $code        = isset( $params['code'] ) ? $params['code'] : '';
        $description = isset( $params['description'] ) ? sanitize_text_field( $params['description'] ) : 'PHP execution';

        if ( empty( $code ) ) {
            return new WP_REST_Response( array( 'error' => 'No PHP code provided.' ), 400 );
        }

        $blocked = array(
            'exec', 'shell_exec', 'system', 'passthru', 'popen', 'proc_open',
            'file_put_contents', 'file_get_contents', 'fopen', 'fwrite', 'fclose',
            'unlink', 'rmdir', 'rename', 'move_uploaded_file',
            'curl_exec', 'curl_init', 'fsockopen', 'stream_socket_client',
            'base64_decode', 'str_rot13', 'gzinflate', 'gzuncompress', 'gzdecode',
            'preg_replace_callback_array',
        );

        foreach ( $blocked as $fn ) {
            if ( preg_match( '/\b' . preg_quote( $fn, '/' ) . '\s*\(/i', $code ) ) {
                return new WP_REST_Response(
                    array( 'error' => 'Blocked function: ' . $fn . '() is not permitted.' ),
                    403
                );
            }
        }

        if ( preg_match( '/\beval\s*\(/i', $code ) ) {
            return new WP_REST_Response( array( 'error' => 'eval() is not permitted inside executed code.' ), 403 );
        }

        $code = trim( $code );
        $code = preg_replace( '/^<\?php\s*/i', '', $code );
        $code = preg_replace( '/\s*\?>$/', '', $code );

        ob_start();
        try {
            $wrapped = 'return (function() use (&$wpdb) { ' . $code . ' })();';
            // phpcs:ignore Squiz.PHP.Eval.Discouraged
            $result = eval( $wrapped );
            $output = ob_get_clean();

            return new WP_REST_Response(
                array(
                    'success'     => true,
                    'description' => $description,
                    'output'      => $output,
                    'result'      => is_scalar( $result ) ? $result : json_encode( $result ),
                ),
                200
            );
        } catch ( \Throwable $e ) {
            ob_end_clean();
            return new WP_REST_Response( array( 'error' => 'PHP error: ' . $e->getMessage() ), 500 );
        }
    }

    if ( 'write_file' === $action ) {
        $path    = isset( $params['path'] ) ? (string) $params['path'] : '';
        $content = isset( $params['content'] ) ? (string) $params['content'] : '';

        if ( '' === $path ) {
            return new WP_REST_Response( array( 'error' => 'path is required.' ), 400 );
        }

        $normalized = ltrim( $path, '/' );

        $wp_content_real = realpath( WP_CONTENT_DIR );
        if ( false === $wp_content_real ) {
            return new WP_REST_Response( array( 'error' => 'Could not resolve WP_CONTENT_DIR.' ), 500 );
        }

        if ( strpos( $normalized, 'wp-content/' ) === 0 ) {
            $abspath_real = realpath( ABSPATH );
            if ( false === $abspath_real ) {
                return new WP_REST_Response( array( 'error' => 'Could not resolve ABSPATH.' ), 500 );
            }
            $target = $abspath_real . DIRECTORY_SEPARATOR . $normalized;
        } else {
            $target = $wp_content_real . DIRECTORY_SEPARATOR . $normalized;
        }

        $parent = dirname( $target );
        if ( ! is_dir( $parent ) ) {
            wp_mkdir_p( $parent );
        }

        $parent_real = realpath( $parent );
        if ( false === $parent_real ) {
            return new WP_REST_Response( array( 'error' => 'Could not resolve parent directory.' ), 500 );
        }

        $full = $parent_real . DIRECTORY_SEPARATOR . basename( $target );

        if ( strpos( $full, $wp_content_real . DIRECTORY_SEPARATOR ) !== 0 && $full !== $wp_content_real ) {
            return new WP_REST_Response( array( 'error' => 'Path outside allowed scope' ), 403 );
        }

        $backup_path = null;
        if ( file_exists( $full ) ) {
            $backup_path = $full . '.backup-' . time();
            if ( ! copy( $full, $backup_path ) ) {
                return new WP_REST_Response( array( 'error' => 'Could not create backup before write.' ), 500 );
            }
        }

        $written = file_put_contents( $full, $content );

        if ( false === $written ) {
            return new WP_REST_Response( array( 'error' => 'Could not write to file.' ), 500 );
        }

        $rel_backup = null;
        if ( $backup_path ) {
            $rel_backup = ltrim( str_replace( realpath( ABSPATH ) . DIRECTORY_SEPARATOR, '', $backup_path ), '/' );
        }

        return new WP_REST_Response(
            array(
                'success'       => true,
                'path'          => $normalized,
                'bytes_written' => $written,
                'backup_path'   => $rel_backup,
            ),
            200
        );
    }

    return new WP_REST_Response(
        array( 'error' => 'Unknown action: ' . $action ),
        400
    );
}

function wordpress_ai_backup(): WP_REST_Response {
    return new WP_REST_Response(
        array(
            'success' => true,
            'message' => 'Backup noted',
        ),
        200
    );
}
