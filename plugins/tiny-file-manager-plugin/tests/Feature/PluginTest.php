<?php

namespace Tests\Feature\Plugins\Vitodeploy\TinyFileManagerPlugin;

use App\Vito\Plugins\Vitodeploy\TinyFileManagerPlugin\Plugin;
use App\Vito\Plugins\Vitodeploy\TinyFileManagerPlugin\TinyFileManager;
use Tests\TestCase;

/**
 * boot() registers a views namespace and the tiny-file-manager site type (with
 * its create form) into the host's runtime config.
 */
class PluginTest extends TestCase
{
    public function test_boot_registers_site_type(): void
    {
        (new Plugin)->boot();

        $type = config('site.types.'.TinyFileManager::id());

        $this->assertIsArray($type);
        $this->assertSame('Tiny File Manager', $type['label']);
        $this->assertSame(TinyFileManager::class, $type['handler']);
        $this->assertNotEmpty($type['form']);
    }
}
