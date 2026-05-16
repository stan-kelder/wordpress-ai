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

    // Query endpoint — stub for future natural language queries.
    register_rest_route(
        $namespace,
        '/query',
        array(
            'methods'             => 'POST',
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
 * Query endpoint handler (stub).
 *
 * @return WP_REST_Response
 */
function wordpress_ai_query(): WP_REST_Response {
    return new WP_REST_Response(
        array( 'error' => 'not implemented' ),
        501
    );
}

/**
 * Execute endpoint handler (stub).
 *
 * @return WP_REST_Response
 */
function wordpress_ai_execute(): WP_REST_Response {
    return new WP_REST_Response(
        array( 'error' => 'not implemented' ),
        501
    );
}
