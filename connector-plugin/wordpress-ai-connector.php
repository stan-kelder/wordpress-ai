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

    // Execute endpoint — handles instruction execution.
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
 *   - list_pages
 *   - list_posts
 *   - get_active_plugins
 *   - get_menu_structure
 *   - get_woocommerce_products
 *   - get_site_settings
 *   - get_users
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

    if ( 'list_posts' === $tool ) {
        $posts = get_posts( array(
            'numberposts' => 20,
            'post_status' => 'publish',
        ) );

        if ( ! is_array( $posts ) ) {
            return new WP_REST_Response( array(), 200 );
        }

        $result = array_map(
            function ( $post ) {
                return array(
                    'id'    => $post->ID,
                    'title' => get_the_title( $post ),
                    'url'   => get_permalink( $post ),
                    'date'  => $post->post_date,
                );
            },
            $posts
        );

        return new WP_REST_Response( $result, 200 );
    }

    if ( 'get_active_plugins' === $tool ) {
        $active_slugs   = get_option( 'active_plugins', array() );
        $all_plugins    = get_plugins();
        $result         = array();

        foreach ( $all_plugins as $slug => $data ) {
            $result[] = array(
                'slug'   => $slug,
                'name'   => $data['Name'],
                'active' => in_array( $slug, $active_slugs, true ),
            );
        }

        return new WP_REST_Response( $result, 200 );
    }

    if ( 'get_menu_structure' === $tool ) {
        $menus  = wp_get_nav_menus();
        $result = array();

        if ( ! is_array( $menus ) ) {
            return new WP_REST_Response( array(), 200 );
        }

        foreach ( $menus as $menu ) {
            $items     = wp_get_nav_menu_items( $menu->term_id );
            $item_list = array();

            if ( is_array( $items ) ) {
                foreach ( $items as $item ) {
                    $item_list[] = array(
                        'id'    => $item->ID,
                        'title' => $item->title,
                        'url'   => $item->url,
                        'order' => $item->menu_order,
                    );
                }
            }

            $result[] = array(
                'id'    => $menu->term_id,
                'name'  => $menu->name,
                'items' => $item_list,
            );
        }

        return new WP_REST_Response( $result, 200 );
    }

    if ( 'get_woocommerce_products' === $tool ) {
        if ( ! function_exists( 'wc_get_products' ) ) {
            return new WP_REST_Response(
                array( 'error' => 'WooCommerce not active' ),
                200
            );
        }

        $products = wc_get_products( array( 'limit' => 20 ) );
        $result   = array();

        foreach ( $products as $product ) {
            $result[] = array(
                'id'     => $product->get_id(),
                'name'   => $product->get_name(),
                'price'  => $product->get_price(),
                'status' => $product->get_status(),
            );
        }

        return new WP_REST_Response( $result, 200 );
    }

    if ( 'get_site_settings' === $tool ) {
        $result = array(
            'blogname'             => get_option( 'blogname' ),
            'blogdescription'      => get_option( 'blogdescription' ),
            'admin_email'          => get_option( 'admin_email' ),
            'siteurl'              => get_option( 'siteurl' ),
            'home'                 => get_option( 'home' ),
            'permalink_structure'  => get_option( 'permalink_structure' ),
        );

        return new WP_REST_Response( $result, 200 );
    }

    if ( 'get_users' === $tool ) {
        $users  = get_users( array( 'number' => 20 ) );
        $result = array();

        foreach ( $users as $user ) {
            $roles    = $user->roles;
            $result[] = array(
                'id'       => $user->ID,
                'username' => $user->user_login,
                'email'    => $user->user_email,
                'role'     => ! empty( $roles ) ? $roles[0] : '',
            );
        }

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
 *   - create_page
 *   - update_page
 *   - delete_page
 *   - create_post
 *   - update_post
 *   - delete_post
 *   - add_menu_item
 *   - update_menu_item
 *   - remove_menu_item
 *   - update_setting
 *   - create_product
 *   - update_product
 *   - create_user
 *   - update_user_role
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
    $params = isset( $body['params'] ) && is_array( $body['params'] )
        ? $body['params']
        : array();

    // -------------------------------------------------------------------------
    // Pages
    // -------------------------------------------------------------------------

    if ( 'create_page' === $action ) {
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
            array( 'success' => true, 'post_id' => $post_id ),
            200
        );
    }

    if ( 'update_page' === $action ) {
        $id      = isset( $params['id'] ) ? (int) $params['id'] : 0;
        $title   = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : null;
        $content = isset( $params['content'] ) ? wp_kses_post( $params['content'] ) : null;
        $status  = isset( $params['status'] ) && in_array( $params['status'], array( 'publish', 'draft' ), true )
            ? $params['status']
            : null;

        if ( $id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid page ID is required.' ), 400 );
        }

        $args = array( 'ID' => $id );
        if ( null !== $title )   { $args['post_title']   = $title; }
        if ( null !== $content ) { $args['post_content'] = $content; }
        if ( null !== $status )  { $args['post_status']  = $status; }

        $result = wp_update_post( $args, true );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( array( 'error' => $result->get_error_message() ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true, 'post_id' => $result ), 200 );
    }

    if ( 'delete_page' === $action ) {
        $id = isset( $params['id'] ) ? (int) $params['id'] : 0;

        if ( $id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid page ID is required.' ), 400 );
        }

        $deleted = wp_delete_post( $id, true );

        if ( false === $deleted || null === $deleted ) {
            return new WP_REST_Response( array( 'error' => 'Failed to delete page.' ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true ), 200 );
    }

    // -------------------------------------------------------------------------
    // Posts
    // -------------------------------------------------------------------------

    if ( 'create_post' === $action ) {
        $title    = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';
        $content  = isset( $params['content'] ) ? wp_kses_post( $params['content'] ) : '';
        $status   = isset( $params['status'] ) && in_array( $params['status'], array( 'publish', 'draft' ), true )
            ? $params['status']
            : 'draft';
        $category = isset( $params['category'] ) ? sanitize_text_field( $params['category'] ) : '';

        if ( empty( $title ) ) {
            return new WP_REST_Response( array( 'error' => 'Post title is required.' ), 400 );
        }

        $post_args = array(
            'post_title'   => $title,
            'post_content' => $content,
            'post_status'  => $status,
            'post_type'    => 'post',
        );

        if ( ! empty( $category ) ) {
            $cat = get_term_by( 'name', $category, 'category' );
            if ( $cat ) {
                $post_args['post_category'] = array( $cat->term_id );
            }
        }

        $post_id = wp_insert_post( $post_args, true );

        if ( is_wp_error( $post_id ) ) {
            return new WP_REST_Response( array( 'error' => $post_id->get_error_message() ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true, 'post_id' => $post_id ), 200 );
    }

    if ( 'update_post' === $action ) {
        $id      = isset( $params['id'] ) ? (int) $params['id'] : 0;
        $title   = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : null;
        $content = isset( $params['content'] ) ? wp_kses_post( $params['content'] ) : null;
        $status  = isset( $params['status'] ) && in_array( $params['status'], array( 'publish', 'draft' ), true )
            ? $params['status']
            : null;

        if ( $id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid post ID is required.' ), 400 );
        }

        $args = array( 'ID' => $id );
        if ( null !== $title )   { $args['post_title']   = $title; }
        if ( null !== $content ) { $args['post_content'] = $content; }
        if ( null !== $status )  { $args['post_status']  = $status; }

        $result = wp_update_post( $args, true );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( array( 'error' => $result->get_error_message() ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true, 'post_id' => $result ), 200 );
    }

    if ( 'delete_post' === $action ) {
        $id = isset( $params['id'] ) ? (int) $params['id'] : 0;

        if ( $id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid post ID is required.' ), 400 );
        }

        $deleted = wp_delete_post( $id, true );

        if ( false === $deleted || null === $deleted ) {
            return new WP_REST_Response( array( 'error' => 'Failed to delete post.' ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true ), 200 );
    }

    // -------------------------------------------------------------------------
    // Menus
    // -------------------------------------------------------------------------

    if ( 'add_menu_item' === $action ) {
        $menu_id     = isset( $params['menu_id'] ) ? (int) $params['menu_id'] : 0;
        $title       = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';
        $url         = isset( $params['url'] ) ? esc_url_raw( $params['url'] ) : '';
        $object_type = isset( $params['object_type'] ) && in_array( $params['object_type'], array( 'custom', 'page' ), true )
            ? $params['object_type']
            : 'custom';
        $object_id   = isset( $params['object_id'] ) ? (int) $params['object_id'] : 0;

        if ( $menu_id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid menu_id is required.' ), 400 );
        }

        $item_args = array(
            'menu-item-title'       => $title,
            'menu-item-url'         => $url,
            'menu-item-status'      => 'publish',
            'menu-item-type'        => $object_type,
        );

        if ( $object_type === 'page' && $object_id > 0 ) {
            $item_args['menu-item-object']    = 'page';
            $item_args['menu-item-object-id'] = $object_id;
        }

        $item_id = wp_update_nav_menu_item( $menu_id, 0, $item_args );

        if ( is_wp_error( $item_id ) ) {
            return new WP_REST_Response( array( 'error' => $item_id->get_error_message() ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true, 'item_id' => $item_id ), 200 );
    }

    if ( 'update_menu_item' === $action ) {
        $menu_id = isset( $params['menu_id'] ) ? (int) $params['menu_id'] : 0;
        $item_id = isset( $params['item_id'] ) ? (int) $params['item_id'] : 0;
        $title   = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : null;
        $url     = isset( $params['url'] ) ? esc_url_raw( $params['url'] ) : null;

        if ( $menu_id <= 0 || $item_id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid menu_id and item_id are required.' ), 400 );
        }

        $item_args = array();
        if ( null !== $title ) { $item_args['menu-item-title'] = $title; }
        if ( null !== $url )   { $item_args['menu-item-url']   = $url; }

        $result = wp_update_nav_menu_item( $menu_id, $item_id, $item_args );

        if ( is_wp_error( $result ) ) {
            return new WP_REST_Response( array( 'error' => $result->get_error_message() ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true, 'item_id' => $result ), 200 );
    }

    if ( 'remove_menu_item' === $action ) {
        $item_id = isset( $params['item_id'] ) ? (int) $params['item_id'] : 0;

        if ( $item_id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid item_id is required.' ), 400 );
        }

        // Menu items are stored as posts of type nav_menu_item
        $deleted = wp_delete_post( $item_id, true );

        if ( false === $deleted || null === $deleted ) {
            return new WP_REST_Response( array( 'error' => 'Failed to remove menu item.' ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true ), 200 );
    }

    // -------------------------------------------------------------------------
    // WordPress Settings
    // -------------------------------------------------------------------------

    if ( 'update_setting' === $action ) {
        $allowed_options = array(
            'blogname',
            'blogdescription',
            'admin_email',
            'date_format',
            'time_format',
            'timezone_string',
            'permalink_structure',
        );

        $option = isset( $params['option'] ) ? sanitize_text_field( $params['option'] ) : '';
        $value  = isset( $params['value'] ) ? sanitize_text_field( $params['value'] ) : '';

        if ( ! in_array( $option, $allowed_options, true ) ) {
            return new WP_REST_Response(
                array( 'error' => 'Option "' . $option . '" is not allowed. Allowed options: ' . implode( ', ', $allowed_options ) ),
                400
            );
        }

        $updated = update_option( $option, $value );

        return new WP_REST_Response( array( 'success' => true, 'updated' => $updated ), 200 );
    }

    // -------------------------------------------------------------------------
    // WooCommerce Products
    // -------------------------------------------------------------------------

    if ( 'create_product' === $action ) {
        if ( ! function_exists( 'wc_get_product' ) ) {
            return new WP_REST_Response( array( 'error' => 'WooCommerce not active.' ), 400 );
        }

        $name        = isset( $params['name'] ) ? sanitize_text_field( $params['name'] ) : '';
        $price       = isset( $params['price'] ) ? sanitize_text_field( $params['price'] ) : '';
        $description = isset( $params['description'] ) ? wp_kses_post( $params['description'] ) : '';
        $status      = isset( $params['status'] ) && in_array( $params['status'], array( 'publish', 'draft' ), true )
            ? $params['status']
            : 'draft';

        if ( empty( $name ) ) {
            return new WP_REST_Response( array( 'error' => 'Product name is required.' ), 400 );
        }

        $product = new WC_Product_Simple();
        $product->set_name( $name );
        $product->set_regular_price( $price );
        $product->set_description( $description );
        $product->set_status( $status );
        $product_id = $product->save();

        if ( ! $product_id ) {
            return new WP_REST_Response( array( 'error' => 'Failed to create product.' ), 500 );
        }

        return new WP_REST_Response( array( 'success' => true, 'post_id' => $product_id ), 200 );
    }

    if ( 'update_product' === $action ) {
        if ( ! function_exists( 'wc_get_product' ) ) {
            return new WP_REST_Response( array( 'error' => 'WooCommerce not active.' ), 400 );
        }

        $id = isset( $params['id'] ) ? (int) $params['id'] : 0;

        if ( $id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid product ID is required.' ), 400 );
        }

        $product = wc_get_product( $id );

        if ( ! $product ) {
            return new WP_REST_Response( array( 'error' => 'Product not found.' ), 404 );
        }

        if ( isset( $params['name'] ) )        { $product->set_name( sanitize_text_field( $params['name'] ) ); }
        if ( isset( $params['price'] ) )        { $product->set_regular_price( sanitize_text_field( $params['price'] ) ); }
        if ( isset( $params['description'] ) )  { $product->set_description( wp_kses_post( $params['description'] ) ); }
        if ( isset( $params['status'] ) && in_array( $params['status'], array( 'publish', 'draft' ), true ) ) {
            $product->set_status( $params['status'] );
        }

        $product->save();

        return new WP_REST_Response( array( 'success' => true, 'post_id' => $id ), 200 );
    }

    // -------------------------------------------------------------------------
    // Users
    // -------------------------------------------------------------------------

    if ( 'create_user' === $action ) {
        $username = isset( $params['username'] ) ? sanitize_user( $params['username'] ) : '';
        $email    = isset( $params['email'] ) ? sanitize_email( $params['email'] ) : '';
        $password = isset( $params['password'] ) ? $params['password'] : wp_generate_password();
        $role     = isset( $params['role'] ) && in_array(
            $params['role'],
            array( 'subscriber', 'contributor', 'author', 'editor', 'administrator' ),
            true
        ) ? $params['role'] : 'subscriber';

        if ( empty( $username ) || empty( $email ) ) {
            return new WP_REST_Response( array( 'error' => 'Username and email are required.' ), 400 );
        }

        $user_id = wp_create_user( $username, $password, $email );

        if ( is_wp_error( $user_id ) ) {
            return new WP_REST_Response( array( 'error' => $user_id->get_error_message() ), 500 );
        }

        wp_update_user( array( 'ID' => $user_id, 'role' => $role ) );

        return new WP_REST_Response( array( 'success' => true, 'user_id' => $user_id ), 200 );
    }

    if ( 'update_user_role' === $action ) {
        $user_id = isset( $params['user_id'] ) ? (int) $params['user_id'] : 0;
        $role    = isset( $params['role'] ) && in_array(
            $params['role'],
            array( 'subscriber', 'contributor', 'author', 'editor', 'administrator' ),
            true
        ) ? $params['role'] : '';

        if ( $user_id <= 0 ) {
            return new WP_REST_Response( array( 'error' => 'Valid user_id is required.' ), 400 );
        }

        if ( empty( $role ) ) {
            return new WP_REST_Response( array( 'error' => 'Valid role is required.' ), 400 );
        }

        $user = new WP_User( $user_id );

        if ( ! $user->exists() ) {
            return new WP_REST_Response( array( 'error' => 'User not found.' ), 404 );
        }

        $user->set_role( $role );

        return new WP_REST_Response( array( 'success' => true ), 200 );
    }

    // -------------------------------------------------------------------------
    // PHP Execution (advanced operations)
    // -------------------------------------------------------------------------

    if ( 'execute_php' === $action ) {
        $code        = isset( $params['code'] ) ? $params['code'] : '';
        $description = isset( $params['description'] ) ? sanitize_text_field( $params['description'] ) : 'PHP execution';

        if ( empty( $code ) ) {
            return new WP_REST_Response( array( 'error' => 'No PHP code provided.' ), 400 );
        }

        // Block dangerous functions and constructs
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

        // Also block eval inside the submitted code
        if ( preg_match( '/\beval\s*\(/i', $code ) ) {
            return new WP_REST_Response( array( 'error' => 'eval() is not permitted inside executed code.' ), 403 );
        }

        ob_start();
        try {
            // Wrap in a function to capture return values
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
