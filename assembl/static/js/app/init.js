requirejs.config(requirejs_config);

require(['jquery', 'jasmine-boot'], function ($, jasmine_boot) {
        'use strict';

        $('#wrapper').hide();

        var jasmineEnv = jasmine.getEnv();
        jasmineEnv.updateInterval = 1000;

        require([
            'tests/views.spec',
            'tests/routes.spec',
            'tests/context.spec',
            'tests/models.spec',
            'tests/utils.spec',
            'tests/objects.spec'
        ], function () {
            // Initialize the HTML Reporter and execute the environment (setup by `boot.js`)
            window.onload();

        });
    });