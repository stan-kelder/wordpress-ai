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

/**
 * Validate the Authorization header contains the correct Bearer token.
 *
 * @param WP_REST_Request $request
 * @return bool
 */
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

/**
 * Permission callback used by all endpoints.
 *
 * @param WP_REST_Request $request
 * @return true|WP_Error
 */
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

/**
 * Register REST API routes.
 */
function wordpress_ai_register_routes(): void {
    $namespace = 'wordpress-ai/v1';

    // Ping endpoint — used by the cloud platform to verify connectivity.
    register_rest_route(
        $namespace,
        '/ping',
        array(
            'methods'             => 'GET',
            'callback'            => 'wordpress_ai_ping',
            'permission_callback' => 'wordpress_ai_permission_callback',
        )
    );

    // Query endpoint — handles tool calls such as list_pages.
    register_rest_route(
        $namespace,
        '/query',
        array(
            'methods'             => 'GET',
            'callback'            => 'wordpress_ai_query',
            'permission_callback' => 'wordpress_ai_permission_callback',
        )
    );

    // Execute endpoint — stub for future instruction execution.
    register_rest_route(
        $namespace,
        '/execute',
        array(
            'methods'             => 'POST',
            'callback'            => 'wordpress_ai_execute',
            'permission_callback' => 'wordpress_ai_permission_callback',
        )
    );

    // Backup endpoint — stub that acknowledges a backup request.
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

/**
 * Ping endpoint handler.
 *
 * @return WP_REST_Response
 */
function wordpress_ai_ping(): WP_REST_Response {
    return new WP_REST_Response(
        array(
            'status' => 'connected',
            'site'   => get_bloginfo( 'name' ),
        ),
        200
    );
}

/**
 * Query endpoint handler.
 *
 * Supports the following tools via ?tool=<name>:
 *   - list_pages: returns all published pages as { id, title, url }
 *
 * @param WP_REST_Request $request
 * @return WP_REST_Response
 */
function wordpress_ai_query( WP_REST_Request $request ): WP_REST_Response {
    $tool = $request->get_param( 'tool' );

    if ( 'list_pages' === $tool ) {
        $pages = get_pages( array( 'post_status' => 'publish' ) );

        if ( ! is_array( $pages ) ) {
            return new WP_REST_Response( array(), 200 );
        }

        $result = array_map(
            function ( $page ) {
                return array(
                    'id'    => $page->ID,
                    'title' => get_the_title( $page ),
                    'url'   => get_permalink( $page ),
                );
            },
            $pages
        );

        return new WP_REST_Response( $result, 200 );
    }

    return new WP_REST_Response(
        array( 'error' => 'Unknown tool: ' . $tool ),
        400
    );
}

/**
 * Execute endpoint handler.
 *
 * Supports the following actions:
 *   - create_page: creates a new WordPress page from the given params.
 *
 * @param WP_REST_Request $request
 * @return WP_REST_Response
 */
function wordpress_ai_execute( WP_REST_Request $request ): WP_REST_Response {
    $body = $request->get_json_params();

    if ( empty( $body['action'] ) ) {
        return new WP_REST_Response(
            array( 'error' => 'Missing action in request body.' ),
            400
        );
    }

    $action = $body['action'];

    if ( 'create_page' === $action ) {
        $params = isset( $body['params'] ) && is_array( $body['params'] )
            ? $body['params']
            : array();

        $title   = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';
        $content = isset( $params['content'] ) ? wp_kses_post( $params['content'] ) : '';
        $status  = isset( $params['status'] ) && in_array( $params['status'], array( 'publish', 'draft' ), true )
            ? $params['status']
            : 'draft';

        if ( empty( $title ) ) {
            return new WP_REST_Response(
                array( 'error' => 'Page title is required.' ),
                400
            );
        }

        $post_id = wp_insert_post(
            array(
                'post_title'   => $title,
                'post_content' => $content,
                'post_status'  => $status,
                'post_type'    => 'page',
            ),
            true
        );

        if ( is_wp_error( $post_id ) ) {
            return new WP_REST_Response(
                array( 'error' => $post_id->get_error_message() ),
                500
            );
        }

        return new WP_REST_Response(
            array(
                'success' => true,
                'post_id' => $post_id,
            ),
            200
        );
    }

    return new WP_REST_Response(
        array( 'error' => 'Unknown action: ' . $action ),
        400
    );
}

/**
 * Backup endpoint handler (stub).
 *
 * Acknowledges a backup request from the cloud platform.
 *
 * @return WP_REST_Response
 */
function wordpress_ai_backup(): WP_REST_Response {
    return new WP_REST_Response(
        array(
            'success' => true,
            'message' => 'Backup noted',
        ),
        200
    );
}
