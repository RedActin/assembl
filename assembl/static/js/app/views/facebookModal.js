'use strict';

var Marionette = require('../shims/marionette.js'),
    Backbone = require('../shims/backbone.js'),
    _ = require('../shims/underscore.js'),
    i18n = require('../utils/i18n.js'),
    $ = require('../shims/jquery.js'),
    Promise = require('bluebird');

var FbStatus = {
  OFFLINE: 'user not logged in',
  CONNECTED: 'user is connected',
  UNAUTHORIZED: 'user has not authenticated assembl'
}

var fbState = function(r, s, m, sm){
  this.ready = r;
  this.fbStatus = s;
  this.msg = m;
  this.submsg = sm;
}

var checkState = function(renderView) {
  window.FB.getLoginStatus(function(resp){
    if (resp.status === 'connected') {
      var currentState = new fbState(true, FbStatus.CONNECTED, null, null);
      renderView(currentState);
      
    }
    else if (resp.status == 'not_authorized') {
      var statusMessage = i18n.gettext("We are sorry, but Assembl does not have your permission to continue. Below are a summary of permissions that Assembl requires in order to continue.");
      var sub = i18n.gettext("Click here to continue");
      var currentState = new fbState(false, FbStatus.UNAUTHORIZED, statusMessage, sub);
      renderView(currentState);
    }
    else {
      var msg = i18n.gettext("You are currently not logged into facebook. Before logging in, please be aware that Assembl will need the following permissions in order to export the current message.");
      var sub = i18n.gettext("Click here to login to Facebook");
      var currentState = new fbState(false, FbStatus.OFFLINE, msg, sub);
      renderView(currentState);
    }
  });
}

var errorView = Marionette.ItemView.extend({
  initialize: function(options){
    this.msg = options.message;
    this.subMsg = options.subMessage;
  },
  serializeData: function() {
    return {
      message: this.msg,
      subMessage: this.subMsg
    }
  },
  template: '#tmpl-exportPostModal-fb-token-error'
});

var groupView = Marionette.ItemView.extend({
    template: '#tmpl-exportPostModal-fb-group',
    serializeData: function() {
      return {
        userManagedGroupList: [
          {value: 'null', description: ''},
          {value: 'self', description: 'Yourself'}
        ]
      }
    },
});
var pageView = Marionette.ItemView.extend({
    template: '#tmpl-exportPostModal-fb-page',
    serializeData: function() {
      return {
        userManagedPagesList: [
          {value: 'null', description: ''},
          {value: 'self', description: 'Yourself'}
          //Add more after API call made
        ]
      }
    },
});

var fbLayout = Marionette.LayoutView.extend({
    template: "#tmpl-exportPostModal-fb",
    regions: {
      subform: '.fb-targeted-form'
    },
    events: {
      'change .js_fb-supportedList': 'defineView',
      'click .js_fb-get-permissions': 'getToken'
    },
    initialize: function(options) {
      console.log('facebook root view initializing');
    },
    getToken: function(event) {
      console.log('I will get the access token!', event);
    },
    defineView: function(event){
      var value = this.$(event.currentTarget)
                      .find('option:selected')
                      .val();

      var accessToken = false;

      switch(value) {
        case 'page':
          this.getRegion('subform').show(new pageView());
          break;
        case 'group':
          this.getRegion('subform').show(new groupView());
          break;
        default:
          //This might be the wrong approach to emptying the region
          this.getRegion('subform').reset();
          break;
      }

    }
});

module.exports = {
  api: window.FB,
  root: fbLayout,
  group: groupView,
  page: pageView,
  error: errorView,
  resolveState: checkState,
  fbStates: fbState
}