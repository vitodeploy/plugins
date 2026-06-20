<?php

namespace Tests\Feature\Plugins\Vitodeploy\LaravelOctanePlugin;

use App\Facades\SSH;
use App\Models\Worker;
use App\Vito\Plugins\Vitodeploy\LaravelOctanePlugin\Actions\Enable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Tests run inside a checkout of the host VitoDeploy app (see scripts/test.mjs).
 * Tests\TestCase auto-provisions $this->user, $this->server (Nginx, PHP,
 * Supervisor, ...) and $this->site, so the plugin's Action can run against a
 * realistic site with SSH faked.
 *
 * Note: a full Enable::handle() with a valid port also calls updateVHost(),
 * which renders host vhost-block views that aren't present in the bare test
 * site. Asserting the worker/type_data side effects of a successful enable
 * therefore requires either seeding the site's vhost or stubbing the webserver
 * — left to the plugin author. These tests cover the parts the Action owns
 * outright: validation and the active() guard.
 */
class EnableTest extends TestCase
{
    use RefreshDatabase;

    public function test_enable_rejects_invalid_port(): void
    {
        SSH::fake();

        $request = Request::create('/', 'POST', ['port' => 70000]);
        $request->setLaravelSession(app('session.store'));

        $this->assertThrows(fn () => (new Enable($this->site))->handle($request));

        $this->assertSame(0, Worker::query()->where('name', 'laravel-octane')->count());
    }

    public function test_action_is_active_when_octane_disabled(): void
    {
        $this->assertTrue((new Enable($this->site))->active());

        $typeData = $this->site->type_data ?? [];
        data_set($typeData, 'octane', true);
        $this->site->type_data = $typeData;
        $this->site->save();

        $this->assertFalse((new Enable($this->site->refresh()))->active());
    }
}
