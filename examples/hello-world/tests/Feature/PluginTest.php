<?php

namespace Tests\Feature\Plugins\YourVendor\HelloWorld;

use App\Vito\Plugins\YourVendor\HelloWorld\Plugin;
use Tests\TestCase;

/**
 * Starter test template.
 *
 * Plugin tests run inside a checkout of the host VitoDeploy app — `npm test`
 * (scripts/test.mjs) stages this plugin and its tests into the host and runs the
 * host's Pest. That gives you the real host classes (App\Plugins\*,
 * App\SiteFeatures\Action, App\Models\*, the SSH facade) plus the
 * auto-provisioned $this->user / $this->server / $this->site from Tests\TestCase.
 *
 * Namespace your tests `Tests\Feature\Plugins\<Vendor>\<Name>\...` and extend
 * Tests\TestCase. See the official plugins' tests/ for SSH-faking and
 * worker/vhost assertions:
 *   https://github.com/vitodeploy/plugins/tree/main/plugins
 */
class PluginTest extends TestCase
{
    public function test_plugin_boots_without_error(): void
    {
        (new Plugin)->boot();

        $this->assertSame('Hello World', (new Plugin)->getName());
    }
}
