'use strict';

var Base = require('./base.js'),
    Ctx = require('../common/context.js');

var emailAccount = Base.Model.extend({
    urlRoot: Ctx.getApiV2DiscussionUrl("/all_users/current/accounts"),
    defaults: {
      will_merge_if_validated: false,
      verified: false,
      profile: 0,
      preferred: false,
      '@type': null,
      'email': null,
      '@id': null
    },
    validate: function(attrs, options){
        /**
         * check typeof variable
         * */

    }

});

var emailAccounts = Base.Collection.extend({
    url: Ctx.getApiV2DiscussionUrl("/all_users/current/accounts"),
    model: emailAccount
});

module.exports = {
    Model: emailAccount,
    Collection: emailAccounts
};
