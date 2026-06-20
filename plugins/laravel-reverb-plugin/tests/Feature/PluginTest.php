<?php

namespace Tests\Feature\Plugins\Vitodeploy\LaravelReverbPlugin;

use App\Vito\Plugins\Vitodeploy\LaravelReverbPlugin\Plugin;
use App\Vito\Plugins\Vitodeploy\LaravelReverbPlugin\SiteTypes\LaravelReverb;
use Tests\TestCase;

/**
 * boot() registers a site feature, its enable/disable actions, a views
 * namespace, and the laravel-reverb site type into the host's runtime config.
 * Asserting against that config proves the plugin wires itself into Vito.
 */
class PluginTest extends TestCase
{
    public function test_boot_registers_site_feature_and_type(): void
    {
        (new Plugin)->boot();

        $features = config('site.types.laravel.features');
        $this->assertIsArray($features);
        $this->assertArrayHasKey('laravel-reverb', $features);
        $this->assertSame('Laravel Reverb', $features['laravel-reverb']['label']);

        $type = config('site.types.'.LaravelReverb::id());
        $this->assertIsArray($type);
        $this->assertSame(LaravelReverb::class, $type['handler']);
    }
}
