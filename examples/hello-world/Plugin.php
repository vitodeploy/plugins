<?php

namespace App\Vito\Plugins\YourVendor\HelloWorld;

use App\Plugins\AbstractPlugin;

/**
 * The plugin entry point. Vito discovers this class by its namespace
 * (App\Vito\Plugins\<Vendor>\<Name>\Plugin) and calls boot() when the plugin is
 * enabled. Register your site types, server providers, features, views, etc. in
 * boot() using the App\Plugins\Register* builders.
 *
 * See the official plugins for real examples:
 *   https://github.com/vitodeploy/plugins/tree/main/plugins
 */
class Plugin extends AbstractPlugin
{
    protected string $name = 'Hello World';

    protected string $description = 'A minimal starter VitoDeploy plugin.';

    public function boot(): void
    {
        // Example: register views, site types, features, etc. here.
        // RegisterViews::make('hello-world')->path(__DIR__.'/views')->register();
    }
}
