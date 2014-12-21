'use strict';

define(['../app', 'jquery', '../utils/permissions', '../utils/roles', 'moment', '../utils/i18n', 'zeroclipboard', 'backbone.modal', 'backbone.marionette.modals', 'bootstrap'],
    function (Assembl, $, Permissions, Roles, Moment, i18n, Zeroclipboard, backboneModal, marionetteModal, bootstrap) {

        var Context = function () {

            this.DISCUSSION_SLUG = $('#discussion-slug').val();
            this.DISCUSSION_ID = $('#discussion-id').val();
            this.SOCKET_URL = $('#socket-url').val();
            this.CURRENT_USER_ID = $('#user-id').val();
            /**
             * Send debugging output to console.log to observe when views render
             * @type {boolean}
             */
            this.debugRender = true;

            /**
             * Send debugging output to console.log to observe socket input
             * @type {boolean}
             */
            this.debugSocket = false;

            /**
             * Prefix used to generate the id of the element used by annotator to find it's annotation
             * @type {string}
             */
            this.ANNOTATOR_MESSAGE_BODY_ID_PREFIX = "message-body-";

            /**
             * The a cache for posts linked by segments
             * FIXME:  Remove once lazy loading is implemented
             * @type {string}
             */
            this.segmentPostCache = {};

            /**
             * Current user
             * @type {User}
             */
            this.currentUser = null;

            /**
             * Csrf token
             * @type {String}
             */
            this.csrfToken = null;

            /**
             * Default ease for all kids of animation
             * @type {String}
             */
            this.ease = 'ease';

            /**
             * The date format
             * @type {String}
             */
            this.dateFormat = 'DD/MM/YYYY';

            /**
             * The datetime format
             * @type {string}
             */
            this.datetimeFormat = 'DD/MM/YYYY HH:mm:ss';

            /**
             * Current dragged segment
             * @type {Segment}
             */
            this.draggedSegment = null;

            /**
             * Current dragged idea
             * @type {Idea}
             */
            this.draggedIdea = null;

            /**
             * Current dragged annotation
             * @type {Annotation}
             */
            this._draggedAnnotation = null;

            /**
             * The selection tooltip.
             * @type {jQuery}
             */
            this.annotatorSelectionTooltip = null;

            /**
             * Reference to dragbox
             * @type {HTMLDivElement}
             */
            this.dragbox = null;

            /**
             * Qty of opened panels
             * @type {Number}
             */
            this.openedPanels = 0;

            this.AVAILABLE_MESSAGE_VIEW_STYLES = {
                TITLE_ONLY: {
                    id: "viewStyleTitleOnly",
                    label: i18n.gettext('Message titles')
                },
                PREVIEW: {
                    id: "viewStylePreview",
                    label: i18n.gettext('Message previews')
                },
                FULL_BODY: {
                    id: "viewStyleFullBody",
                    label: i18n.gettext('Complete messages')
                }
            };

            /*
             * Current discussion
             * @type {Discussion}
             */
            this.discussion = undefined;

            /*
             * Current discussion Promise object
             * @type {Promise}
             */
            this.discussionPromise = undefined;


            /*
             * Cached associative array (String -> Promise which returns an Object[String -> String]) of widget data associated to an idea
             * @type {Object}
             */
            this.cachedWidgetDataAssociatedToIdeasPromises = {};

            this.init();
        }

        Context.prototype = {

            getDiscussionSlug: function () {
                return this.DISCUSSION_SLUG;
            },

            getDiscussionPromise: function () {

                var deferred = $.Deferred();
                var that = this;
                //var url =  this.getApiUrl();
                //var url = this.getApiV2Url() + '/Discussion/' + this.getDiscussionId();
                var url = this.getApiV2DiscussionUrl();

                if (this.discussionPromise === undefined) {
                    this.discussion = undefined;
                    this.discussionPromise = $.get(url, function (data) {
                        that.discussion = data;
                        deferred.resolve(that.discussion);
                    });
                }
                else {
                    this.discussionPromise.done(function () {
                        deferred.resolve(that.discussion);
                    });
                }

                return deferred.promise();
            },

            getSocketUrl: function () {
                return this.SOCKET_URL;
            },

            getDiscussionId: function () {
                return this.DISCUSSION_ID;
            },

            getCurrentUserId: function () {
                return this.CURRENT_USER_ID;
            },

            getCurrentUser: function () {
                return this.currentUser;
            },

            setCurrentUser: function (user) {
                this.currentUser = user;
            },

            getCsrfToken: function () {
                return this.csrfToken || this.loadCsrfToken(false);
            },

            setCsrfToken: function (token) {
                this.csrfToken = token;
            },

            getDraggedAnnotation: function () {
                return this._draggedAnnotation;
            },

            setDraggedAnnotation: function (annotation, annotatorEditor) {
                this._draggedAnnotation = annotation;
                this._annotatorEditor = annotatorEditor;
            },

            /**
             * Set the given Idea as the current one to be edited
             * @param  {Idea} [idea]
             */
            DEPRECATEDsetCurrentIdea: function (idea) {
                //console.log("DEPRECATEDsetCurrentIdea() fired", idea);
                if (idea != this.DEPRECATEDgetCurrentIdea()) {
                    this.currentIdea = idea;
                    //TODO:  Remove this, it will not respect group separation of context
                    Assembl.vent.trigger("DEPRECATEDidea:selected", idea);
                }

            },

            DEPRECATEDgetCurrentIdea: function () {
                return this.currentIdea;
            },

            /**
             * Returns a template from an script tag
             * @param {string} id The id of the script tag
             * @return {function} The Underscore.js _.template return
             */
            loadTemplate: function (id) {
                var template = $('#tmpl-' + id);
                if (template.length) {
                    // Only for app page
                    return _.template(template.html());
                }
            },

            /**
             * get a view style definition by id
             * @param {messageViewStyle.id}
             * @return {messageViewStyle or undefined}
             */
            getMessageViewStyleDefById: function (messageViewStyleId) {
                return  _.find(this.AVAILABLE_MESSAGE_VIEW_STYLES, function (messageViewStyle) {
                    return messageViewStyle.id == messageViewStyleId;
                });
            },

            getUrlFromUri: function (str) {
                var start = "local:";
                if (str.indexOf(start) == 0) {
                    str = "/data/" + str.slice(start.length);
                }
                return str;
            },

            /**
             * Formats the url to the current api url
             * @param  {string} url
             * @return {string} The url formatted
             */
            getApiUrl: function (url) {
                if (url === undefined)
                    url = '/';
                else if (url[0] !== '/') {
                    url = '/' + url;
                }
                return '/api/v1/discussion/' + this.getDiscussionId() + url;
            },

            getApiV2Url: function (url) {
                if (url === undefined)
                    url = '/';
                else if (url[0] !== '/') {
                    url = '/' + url;
                }
                return '/data' + url;
            },

            getApiV2DiscussionUrl: function (url) {
                if (url === undefined)
                    url = '/';
                else if (url[0] !== '/') {
                    url = '/' + url;
                }
                return this.getApiV2Url('Discussion/' + this.getDiscussionId() + url);
            },

            /**
             * Formats the given to the generic api url
             * @param {string} id The class name used in the api
             * @return {string} The url formatted
             *
             * ex: 'local:Extract/1' -> '/api/v1/discussion/1/generic/Extract/1'
             */
            //FIXME: this method never use in app
            /*getGenericApiUrl: function(id){
             var url = '/api/v1/discussion/' + this.getDiscussionId() + '/generic/';
             return id.replace('local:', url);
             },*/

            /**
             * Show or hide the given panel
             * @param  {String} panelName
             */
            togglePanel: function (panelName) {
                var panel = assembl[panelName],
                    ctx = new Context();

                if (panel === undefined) {
                    return false;
                }
                if (panel.$el.hasClass('is-visible')) {
                    ctx.closePanel(panel);
                } else {
                    ctx.openPanel(panel);
                }
            },

            /**
             * Close the given panel
             * @param {backbone.View} panel
             */
            closePanel: function (panel) {
                if (!panel.$el.hasClass('is-visible')) {
                    return false;
                }

                assembl.openedPanels -= 1;
                $(document.body).attr('data-panel-qty', assembl.openedPanels);

                if (this.isInFullscreen()) {
                    $(document.body).addClass('is-fullscreen');
                }

                panel.$el.removeClass('is-visible');

                this.removePanelFromStorage(panel.el.id);

                if (panel.button) {
                    panel.button.removeClass('active');
                }
                Assembl.vent.trigger("panel:close", [panel]);
            },

            /**
             * Open the given panel
             * @param {backbone.View} panel
             */
            openPanel: function (panel) {
                if (panel.$el.hasClass('is-visible')) {
                    return false;
                }
                this.openedPanels += 1;
                $(document.body).attr('data-panel-qty', this.openedPanels);
                $(document.body).removeClass('is-fullscreen');
                panel.$el.addClass('is-visible');

                this.addPanelToStorage(panel.el.id);

                if (panel.button) {
                    panel.button.addClass('active');
                }
                Assembl.vent.trigger("panel:open", [panel]);
            },

            /**
             * @return {Object} The Object with all panels in the localStorage
             */
            getPanelsFromStorage: function () {
                var panels = JSON.parse(localStorage.getItem('panels')) || {};
                return panels;
            },

            /**
             * Adds a panel in the localStoage
             * @param {string} panelId
             * @return {Object} The current object
             */
            addPanelToStorage: function (panelId) {
                var panels = this.getPanelsFromStorage();
                panels[panelId] = 'open';
                localStorage.setItem('panels', JSON.stringify(panels));

                return panels;
            },

            /**
             * Remove a panel from the localStorage by its id
             * @param  {string} panelId
             * @return {Object} The remaining panels
             */
            removePanelFromStorage: function (panelId) {
                var panels = this.getPanelsFromStorage();
                delete panels[panelId];
                localStorage.setItem('panels', JSON.stringify(panels));

                return panels;
            },

            /**
             * @return {Object} The Object with mesagelistconfig in the localStorage
             */
            getMessageListConfigFromStorage: function () {
                var messageListConfig = JSON.parse(localStorage.getItem('messageListConfig')) || {};
                return messageListConfig;
            },

            /**
             * Adds a panel in the localStorage
             * @param {Object} The Object with mesagelistconfig in the localStorage
             * @return {Object} The Object with mesagelistconfig in the localStorage
             */
            setMessageListConfigToStorage: function (messageListConfig) {
                localStorage.setItem('messageListConfig', JSON.stringify(messageListConfig));
                return messageListConfig;
            },

            /**
             * Checks if there is a panel in fullscreen mode
             * ( i.e.: there is only one open )
             * @return {Boolean}
             */
            isInFullscreen: function () {
                return this.openedPanels === 1;
            },

            // Modal can be dynamically resized once the iframe is loaded, or on demand
            // TODO: options to set modal size
            openTargetInModal: function (evt, onDestroyCallback, options) {
                console.log("openInspireMeModal()");
                console.log("evt: ", evt);

                var target_url = null;
                if (evt && evt.currentTarget) {
                    if ($(evt.currentTarget).attr("data-href"))
                        target_url = $(evt.currentTarget).attr("data-href");
                    else if ($(evt.currentTarget).attr("href") && $(evt.currentTarget).attr("href") != "#")
                        target_url = $(evt.currentTarget).attr("href");
                }
                if (!target_url)
                    return false;

                var modal_title = "";
                if (evt && evt.currentTarget && $(evt.currentTarget).attr("data-modal-title"))
                    modal_title = $(evt.currentTarget).attr("data-modal-title");

                var resizeIframeOnLoad = false;
                if (evt && evt.currentTarget && $(evt.currentTarget).attr("data-modal-resize-on-load"))
                    resizeIframeOnLoad = $(evt.currentTarget).attr("data-modal-resize-on-load") != false && $(evt.currentTarget).attr("data-modal-resize-on-load") != "false";

                var resizable = false;
                if (evt && evt.currentTarget && $(evt.currentTarget).attr("data-modal-resizable"))
                    resizable = $(evt.currentTarget).attr("data-modal-resizable") != false && $(evt.currentTarget).attr("data-modal-resizable") != "false";

                var model = new Backbone.Model();
                model.set("iframe_url", target_url);
                model.set("modal_title", modal_title);
                model.set("resizeIframeOnLoad", resizeIframeOnLoad);

                var className = 'group-modal popin-wrapper iframe-popin';
                if (options && options.footer === false)
                    className += " popin-without-footer";
                if (!resizable)
                    className += " popin-fixed-size";

                var Modal = Backbone.Modal.extend({
                    template: Ctx.loadTemplate('modalWithIframe'),
                    className: className,
                    cancelEl: '.close',
                    keyControl: false,
                    model: model
                });

                window.modal_instance = new Modal();
                if (onDestroyCallback)
                    window.modal_instance.onDestroy = onDestroyCallback;
                window.exitModal = function () {
                    window.modal_instance.destroy();
                };

                window.resizeIframe = function (iframe, retry) {
                    if (!iframe)
                        iframe = $(".iframe-popin iframe").get(0);
                    if (!iframe)
                        return;
                    var modal = $(iframe).parents(".bbm-modal");
                    if (!modal)
                        return;
                    console.log("modal: ", modal);
                    var targetHeight = iframe.contentWindow.document.body.scrollHeight; // margins are not included (but paddings are)
                    var targetWidth = iframe.contentWindow.document.body.scrollWidth;
                    console.log("targetWidth: ", targetWidth);
                    if (targetHeight > 10) {
                        $(iframe).css("height", ""); // reset style which was originally calc(100vh - 100px);
                        var addPixelsToCompensateMargins = 40;
                        var animatingProperties = {
                            "height": (targetHeight + addPixelsToCompensateMargins) + "px"
                        };
                        if (targetWidth > 10) {
                            modal.css("min-width", "initial");
                            $(iframe).css("width", ""); // reset style
                            animatingProperties.width = (targetWidth + addPixelsToCompensateMargins) + "px";
                        }

                        $(iframe).animate(
                            animatingProperties,
                            {
                                complete: function () {
                                    $(this).css("display", "block"); // so that no white horizontal block is shown between iframe and footer or bottom limit of the modal
                                }
                            }
                        );
                    }
                    else if (retry !== false) {
                        setTimeout(function () {
                            window.resizeIframe(iframe, false);
                        }, 1000);
                    }
                };

                Assembl.slider.show(window.modal_instance);

                return false; // so that we cancel the normal behaviour of the clicked link (aka making browser go to "target" attribute of the "a" tag)
            },

            invalidateWidgetDataAssociatedToIdea: function (idea_id) {
                //console.log("invalidateWidgetDataAssociatedToIdea(", idea_id, ")");
                //console.log("this.cachedWidgetDataAssociatedToIdeasPromises: ", this.cachedWidgetDataAssociatedToIdeasPromises);
                if (idea_id == "all")
                    this.cachedWidgetDataAssociatedToIdeasPromises = {};
                else
                    this.cachedWidgetDataAssociatedToIdeasPromises[idea_id] = null;
            },

            // TODO: do it also for the vote widgets (not only the creativity widgets), and use this promise where we need vote widgets
            getWidgetDataAssociatedToIdeaPromise: function (idea_id) {
                //console.log("getWidgetDataAssociatedToIdeaPromise()");
                var returned_data = {};
                var that = this;
                var deferred = $.Deferred();

                if (idea_id in that.cachedWidgetDataAssociatedToIdeasPromises && that.cachedWidgetDataAssociatedToIdeasPromises[idea_id] != null) {
                    //console.log("getWidgetDataAssociatedToIdeaPromise(): we will serve the cached promise");
                    that.cachedWidgetDataAssociatedToIdeasPromises[idea_id].done(function (data) {
                        deferred.resolve(data);
                    });
                    return deferred.promise();
                }

                // Get inspiration widgets associated to this idea, via "ancestor_inspiration_widgets"
                // And compute a link to create an inspiration widget

                var inspiration_widgets_url = this.getApiV2DiscussionUrl("ideas/" + this.extractId(idea_id) + "/ancestor_inspiration_widgets");
                var inspiration_widgets = null;
                var inspiration_widget_url = null;
                var inspiration_widget_configure_url = null;
                var inspiration_widget_create_url = null;

                var locale_parameter = "&locale=" + assembl_locale;

                inspiration_widget_create_url = "/static/widget/creativity/?admin=1" + locale_parameter + "#/admin/create_from_idea?idea="
                    + encodeURIComponent(idea_id + "?view=creativity_widget"); // example: "http://localhost:6543/widget/creativity/?admin=1#/admin/configure_instance?widget_uri=%2Fdata%2FWidget%2F43&target=local:Idea%2F3"
                returned_data["inspiration_widget_create_url"] = inspiration_widget_create_url;


                $.getJSON(inspiration_widgets_url, function (data) {
                    //console.log("ancestor_inspiration_widgets data: ", data);

                    if (data
                        && data instanceof Array
                        && data.length > 0
                        ) {
                        inspiration_widgets = data;
                        returned_data["inspiration_widgets"] = inspiration_widgets;
                        var inspiration_widget_uri = inspiration_widgets[inspiration_widgets.length - 1]; // for example: "local:Widget/52"
                        //console.log("inspiration_widget_uri: ", inspiration_widget_uri);

                        inspiration_widget_url = "/static/widget/creativity/?config="
                            + Ctx.getUrlFromUri(inspiration_widget_uri)
                            + "&target="
                            + idea_id
                            + locale_parameter; // example: "http://localhost:6543/widget/creativity/?config=/data/Widget/43&target=local:Idea/3#/"
                        //console.log("inspiration_widget_url: ", inspiration_widget_url);
                        returned_data["inspiration_widget_url"] = inspiration_widget_url;

                        inspiration_widget_configure_url = "/static/widget/creativity/?admin=1"
                            + locale_parameter
                            + "#/admin/configure_instance?widget_uri="
                            + Ctx.getUrlFromUri(inspiration_widget_uri)
                            + "&target="
                            + idea_id; // example: "http://localhost:6543/widget/creativity/?admin=1#/admin/configure_instance?widget_uri=%2Fdata%2FWidget%2F43&target=local:Idea%2F3"
                        returned_data["inspiration_widget_configure_url"] = inspiration_widget_configure_url;
                    }
                    //that.cachedWidgetDataAssociatedToIdeas[idea_id] = returned_data;
                    deferred.resolve(returned_data);
                });

                that.cachedWidgetDataAssociatedToIdeasPromises[idea_id] = deferred;


                return deferred.promise();
            },

            /**
             * @return {Segment}
             */
            getDraggedSegment: function () {
                var segment = this.draggedSegment;
                this.draggedSegment = null;

                if (segment) {
                    delete segment.attributes.highlights;
                }

                return segment;
            },

            /**
             * @return {Idea}
             */
            getDraggedIdea: function () {
                if (this.ideaList && this.draggedIdea) {

                    Assembl.vent.trigger('ideaList:removeIdea', this.draggedIdea);
                }

                var idea = this.draggedIdea;
                this.draggedIdea = null;

                return idea;
            },

            /**
             * fallback: synchronously load app.csrfToken
             */
            loadCsrfToken: function (async) {
                var that = this;
                $.ajax('/api/v1/token', {
                    async: async,
                    dataType: 'text',
                    success: function (data) {
                        that.setCsrfToken(data);
                    }
                });
            },

            /**
             * Return the Post related to the given annotation
             * @param {Annotation} annotation
             * @return {Message}
             */
            getPostIdFromAnnotation: function (annotation) {
                var span = $(annotation.highlights[0]),
                    messageId = span.closest('[id^="' + this.ANNOTATOR_MESSAGE_BODY_ID_PREFIX + '"]').attr('id');

                return messageId.substr(this.ANNOTATOR_MESSAGE_BODY_ID_PREFIX.length);
            },

            /**
             * Saves the current annotation if there is any
             */
            saveCurrentAnnotationAsExtract: function () {
                if (this.getCurrentUser().can(Permissions.EDIT_EXTRACT)) {
                    this._annotatorEditor.element.find('.annotator-save').click();
                }
            },

            /**
             * Creates the selection tooltip
             */
            __createAnnotatorSelectionTooltipDiv: function () {
                this.annotatorSelectionTooltip = $('<div>', { 'class': 'textbubble' });
                $(document.body).append(this.annotatorSelectionTooltip.hide());
            },

            /**
             * Shows the dragbox when user starts dragging an element
             * @param  {Event} ev The event object
             * @param  {String} text The text to be shown in the .dragbox
             */
            showDragbox: function (ev, text) {

                var dragbox_max_length = 25,
                    that = this;

                if (ev.originalEvent) {
                    ev = ev.originalEvent;
                }

                if (this.dragbox === null) {
                    this.dragbox = document.createElement('div');
                    this.dragbox.className = 'dragbox';
                    this.dragbox.setAttribute('hidden', 'hidden');

                    $(document.body).append(this.dragbox);
                }

                this.dragbox.removeAttribute('hidden');

                text = text || i18n.gettext('Extract');

                if (text.length > dragbox_max_length) {
                    text = text.substring(0, dragbox_max_length) + '...';
                }
                this.dragbox.innerHTML = text;

                if (ev.dataTransfer) {
                    ev.dataTransfer.dropEffect = 'all';
                    ev.dataTransfer.effectAllowed = 'copy';
                    ev.dataTransfer.setData("text/plain", text);
                    ev.dataTransfer.setDragImage(this.dragbox, 10, 10);
                }

                $(ev.currentTarget).one("dragend", function () {
                    that.dragbox.setAttribute('hidden', 'hidden');
                });
            },

            /**
             * Return the current time
             * @return {timestamp}
             */
            getCurrentTime: function () {
                return (new Date()).getTime();
            },

            /**
             * Format string function
             * @param {string} string
             * @param {string} ...
             * @return {string}
             */
            format: function (str) {
                var args = [].slice.call(arguments, 1);

                return str.replace(/\{(\d+)\}/g, function (a, b) {
                    return typeof args[b] != 'undefined' ? args[b] : a;
                });
            },

            /**
             * Format date
             * @param {Date|timestamp} date
             * @param {string} [format=app.dateFormat] The format
             * @return {string}
             */
            formatDate: function (date, format) {
                format = format || this.dateFormat;

                if (date === null) {
                    return '';
                }

                date = new Moment(date);
                return date.format(format);
            },

            /**
             * Format date time
             * @param {Date|timestamp} date
             * @param {String} [format=app.datetimeFormat] The format
             * @return {string}
             */
            //FIXME: this method never use in app
            /*formatDatetime: function(date, format){
             return this.formatDate(date, format || this.datetimeFormat);
             },*/

            /**
             * Returns a fancy date (ex: a few seconds ago), or a formatted precise date if precise is true
             * @return {String}
             */
            getNiceDateTime: function (date, precise, with_time) {
                // set default values
                precise = (precise === undefined) ? false : precise;
                with_time = (with_time === undefined) ? true : with_time;
                //var momentDate = moment(date);

                // we assume that server datetimes are given in UTC format
                // (Right now, the server gives UTC datetimes but is not explicit enough because it does not append "+0000". So Moment thinks that the date is not in UTC but in user's timezone. So we have to tell it explicitly, using .utc())
                var momentDate = Moment.utc(date);
                momentDate.local(); // switch off UTC mode, which had been activated using .utc()

                if (momentDate) {
                    if (precise == true) {
                        if (with_time == true)
                            return momentDate.format('LLLL');
                        else
                            return momentDate.format('LL');
                    }
                    var one_year_ago = Moment().subtract(1, 'years');
                    if (momentDate.isBefore(one_year_ago)) { // show the exact date
                        return momentDate.format('L');
                    }
                    else { // show "x days ago", or something like that
                        return momentDate.fromNow();
                    }
                }
                return momentDate; // or date?
            },

            // without time
            getNiceDate: function (date, precise) {
                if (precise === undefined)
                    precise = true;
                return this.getNiceDateTime(date, precise, false);
            },

            /**
             * Returns a nicely formatted date, but not an approximative expression (i.e. not "a few seconds ago")
             * @return {String}
             */
            getReadableDateTime: function (date) {
                return this.getNiceDateTime(date, true);
            },

            /**
             * Shows the context menu given the options
             * @param {Number} x
             * @param {Number} y
             * @param {Object} scope The scope where the functions will be executed
             * @param {Object<string:function>} items The items on the context menu
             */
            //FIXME: this method never use in app
            /*showContextMenu: function(x, y, scope, items){
             var menu_width = 150;


             this.hideContextMenu();

             var menu = $('<div>').addClass('contextmenu');

             // Adjusting position
             if( (x + menu_width) > (window.innerWidth - 50) ){
             x = window.innerWidth - menu_width - 10;
             }

             menu.css({'top': y, 'left': x});

             _.each(items, function(func, text){
             var item = $('<a>').addClass('contextmenu-item').text(text);
             item.on('click', func.bind(scope) );
             menu.append( item );
             });

             $(document.body).append( menu );
             window.setTimeout(function(){
             $(document).on("click", this.hideContextMenu);
             });

             // Adjusting menu position
             var menuY = menu.height() + y,
             maxY = window.innerHeight - 50;

             if( menuY >= maxY ){
             menu.css({'top': maxY - menu.height() });
             }
             },*/

            /**
             * Shows the segment source in the better way related to the source
             * e.g.: If it is an email, opens it, if it is a webpage, open in another window ...
             * @param {Segment} segment
             */
            showTargetBySegment: function (segment) {
                var target = segment.get('target');

                switch (target['@type']) {
                    case 'Webpage':
                        window.open(target.url, "_blank");
                        break;

                    default:
                        // This will treat:
                        // ['Email', 'Post', 'AssemblPost', 'SynthesisPost', 'ImportedPost', 'PostWithMetadata', 'IdeaProposalPost']

                        var selector = this.format('[data-annotation-id="{0}"]', segment.id);

                        Assembl.vent.trigger('messageList:showMessageById', segment.get('idPost'), function () {
                            $(selector).highlight();
                        });

                        break;
                }
            },

            /**
             * @see http://blog.snowfinch.net/post/3254029029/uuid-v4-js
             * @return {String} an uuid
             */
            //FIXME: this method never use in app
            /*createUUID: function(){
             var uuid = "", i = 0, random;

             for (; i < 32; i++) {
             random = Math.random() * 16 | 0;

             if (i == 8 || i == 12 || i == 16 || i == 20) {
             uuid += "-";
             }

             uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16);
             }

             return uuid;
             },*/

            /**
             * Given the string in the format "local:ModelName/{id}" returns the id
             * @param  {String} str
             * @return {String}
             */
            extractId: function (str) {
                return str.split('/')[1];
            },

            /**
             * @param  {Number} userID The user's ID
             * @param  {Number} [size=44] The avatar size
             * @return {String} The avatar's url formatted with the given size
             */
            formatAvatarUrl: function (userID, size) {
                size = size || 44;
                return this.format("/user/id/{0}/avatar/{1}", userID, size);
            },

            /**
             * @param  {String} html
             * @return {String} The new string without html tags
             */
            stripHtml: function (html) {
                return html ? $.trim($('<div>' + html + '</div>').text()) : html;
            },

            /**
             * Sets the given panel as fullscreen closing all other ones
             * @param {Panel} targetPanel
             */
            setFullscreen: function (targetPanel) {
                //TODO: custom view for this
                var panels = [
                    assembl.ideaList,
                    assembl.segmentList,
                    assembl.ideaPanel,
                    assembl.messageList,
                    assembl.synthesisPanel
                ];

                _.each(panels, function (panel) {
                    if (targetPanel !== panel) {
                        this.closePanel(panel);
                        $(document.body).addClass('is-fullscreen');
                    }
                });

                this.DEPRECATEDsetCurrentIdea(null);
            },

            /**
             * @event
             */
            onDropdownClick: function (e) {
                if (!e || !(e.target))
                    return;
                var dropdown = $(e.target);
                if (!dropdown.hasClass("dropdown-label"))
                    dropdown = dropdown.parents(".dropdown-label").first();
                if (!dropdown)
                    return;

                var parent = dropdown.parent();

                var onMouseLeave = function (e) {
                    parent.removeClass('is-open');
                    e.stopPropagation(); // so that onDropdownClick() is not called again immediately after when we click
                };

                if (parent.hasClass('is-open')) {
                    onMouseLeave();
                    return;
                }

                parent.addClass('is-open');
                $(document.body).one('click', onMouseLeave);
            },

            /**
             * @event
             */
            onAjaxError: function (ev, jqxhr, settings, exception) {
                var message = i18n.gettext('ajax error message:');
                message = "url: " + settings.url + "\n" + message + "\n" + exception;

                var model = new Backbone.Model({
                    msg: message
                });

                var Modal = Backbone.Modal.extend({
                    template: _.template($('#tmpl-ajaxError').html()),
                    className: 'group-modal popin-wrapper modal-ajaxError',
                    cancelEl: '.close, .btn-cancel',
                    model: model,
                    initialize: function () {
                        this.$('.bbm-modal').addClass('popin');
                    },
                    events: {
                        'click .js_reload': 'reload'
                    },

                    reload: function () {
                        window.location.reload()
                    }

                });

                var modal = new Modal();

                $('#slider').html(modal.render().el);
            },

            setLocale: function (locale) {
                document.cookie = "_LOCALE_=" + locale + "; path=/";
                location.reload(true);
            },
            InterfaceTypes: {
                SIMPLE: "SIMPLE",
                EXPERT: "EXPERT"
            },
            /** Set the user interface the user wants
             * @param interface_id, one of SIMPLE, EXPERT
             * */
            setInterfaceType: function (interface_id) {
                document.cookie = "interface=" + interface_id + "; path=/";
                location.reload(true);
            },

            getCookieItem: function (sKey) {
                return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
            },

            canUseExpertInterface: function () {
                var user = this.getCurrentUser();
                if (user.can(Permissions.ADD_EXTRACT) ||
                    user.can(Permissions.EDIT_EXTRACT) ||
                    user.can(Permissions.EDIT_MY_EXTRACT) ||
                    user.can(Permissions.ADD_IDEA) ||
                    user.can(Permissions.EDIT_IDEA) ||
                    user.can(Permissions.EDIT_SYNTHESIS) ||
                    user.can(Permissions.SEND_SYNTHESIS) ||
                    user.can(Permissions.ADMIN_DISCUSSION) ||
                    user.can(Permissions.SYSADMIN)
                    ) {
                    return true;
                }
                else {
                    return false;
                }
            },

            getCurrentInterfaceType: function () {
                var interfaceType = this.getCookieItem('interface');
                if (!this.canUseExpertInterface()) {
                    interfaceType = this.InterfaceTypes.SIMPLE
                }
                else {
                    if (interfaceType === null) {
                        interfaceType = this.InterfaceTypes.EXPERT
                    }
                }
                return interfaceType;
            },

            /**
             * @init
             */
            initTooltips: function (elm) {
                elm.find('[data-toggle="tooltip"]').tooltip({
                    container: 'body'
                });
            },

            /**
             * Removes all tooltips from the screen.  Without this, active
             * tooltips (those currently displayed) will be left dangling
             * if the trigger element is removed from the dom.
             */
            removeCurrentlyDisplayedTooltips: function () {
                //console.log("removeCurrentlyDisplayedTooltips() called");
                //This really does need to be global.
                //Should be fast, they are at the top level and there is only
                //a few of them.  Maybe it can be more specific to be faster
                // ex: html > .tipsy I don't know jquery enough to know
                $('.tooltip').remove();
            },

            /**
             * @init
             */
            initClipboard: function () {
                if (!assembl.clipboard) {
                    Zeroclipboard.setDefaults({
                        moviePath: '/static/js/bower/zeroclipboard/ZeroClipboard.swf'
                    });
                    assembl.clipboard = new Zeroclipboard();

                    assembl.clipboard.on(assembl.clipboard, 'mouseover', function () {
                        $(this).trigger('mouseover');
                    });

                    assembl.clipboard.on('mouseout', function () {
                        $(this).trigger('mouseout');
                    });
                }

                var that = this;
                $('[data-copy-text]').each(function (i, el) {
                    var text = el.getAttribute('data-copy-text');
                    text = that.format('{0}//{1}/{2}{3}', location.protocol, location.host, that.getDiscussionSlug(), text);
                    el.removeAttribute('data-copy-text');

                    el.setAttribute('data-clipboard-text', text);
                    assembl.clipboard.glue(el);
                });
            },

            isNewUser: function () {
                var currentUser = null,
                    connectedUser = null;

                if (window.localStorage.getItem('lastCurrentUser')) {
                    currentUser = window.localStorage.getItem('lastCurrentUser').split('/')[1];
                }

                if (this.currentUser.get('@id') !== Roles.EVERYONE) {
                    connectedUser = this.currentUser.get('@id').split('/')[1];
                }

                if (currentUser) {
                    if (connectedUser != currentUser) {
                        window.localStorage.removeItem('expertInterfacegroupItems');
                        window.localStorage.removeItem('simpleInterfacegroupItems');
                        window.localStorage.removeItem('composing_messages');
                    }
                } else {
                    window.localStorage.setItem('lastCurrentUser', this.currentUser.get('@id'));
                }

            },
            /**
             * @init
             * inits ALL app components
             */
            init: function () {
                //this.loadCurrentUser();
                Moment.locale(assembl_locale);

                $(document.body).removeClass('preload');
                this.__createAnnotatorSelectionTooltipDiv();
                //this.initTooltips($("body"));

                $(document).on('click', '.dropdown-label', this.onDropdownClick);
                $(document).on('ajaxError', this.onAjaxError);
            }
        }

        return new Context();

    });