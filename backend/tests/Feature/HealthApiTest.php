<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthApiTest extends TestCase
{
    public function test_zainex_api_health_endpoint_is_online(): void
    {
        $response = $this->getJson('/api/health');

        $response
            ->assertOk()
            ->assertJson([
                'ok' => true,
                'service' => 'ZAINEX Laravel API',
                'status' => 'online',
            ]);
    }

    public function test_zainex_markets_endpoint_contains_all_markets(): void
    {
        $response = $this->getJson('/api/markets');

        $response
            ->assertOk()
            ->assertJsonPath('data.0.id', 'crypto')
            ->assertJsonPath('data.1.id', 'forex')
            ->assertJsonPath('data.2.id', 'stocks');
    }
}