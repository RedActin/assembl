'use strict';

define(['app', 'backbone.marionette', 'views/ideaList', 'views/navigation/notification', 'views/navigation/home', 'views/navigation/synthesisInNavigation', 'views/navigation/linkListView', 'views/assemblPanel', 'common/context', 'utils/permissions', 'jquery', 'utils/panelSpecTypes', 'jed', 'common/collectionManager'],
    function (Assembl, Marionette, IdeaList, sidebarNotification, HomePanel, SynthesisInNavigationPanel, LinkListView, AssemblPanel, Ctx, Permissions, $, PanelSpecTypes, Jed, CollectionManager) {

        var NavigationView = AssemblPanel.extend({
            template: "#tmpl-navigation",
            panelType: PanelSpecTypes.NAV_SIDEBAR,
            className: "navSidebar",
            hideHeader: true,
            gridSize: AssemblPanel.prototype.NAVIGATION_PANEL_GRID_SIZE,
            minWidth: 350,
            //This MUST match the variables in _variables.scss
            group_header_height: 0,
            group_editable_header_height: 25,
            li_height: 40,
            getTitle: function () {
                return 'Navigation'; // unused
            },
            regions: {
                home: '.home',
                debate: '.debate',
                synthesis: '.synthesis',
                notification: '.navNotification',
                visualizationList: '.visualization-list'
            },
            ui: {
                navigation: '.js_navigation',
                ideaFromIdealist: '.js_addIdeaFromIdeaList',
                level: 'div.second-level',
                visualization_tab: '#visualization_tab'
            },
            events: {
                'click @ui.navigation': 'toggleMenuByEvent',
                'click @ui.ideaFromIdealist': 'addIdeaFromIdeaList'
            },
            initialize: function (options) {
                Object.getPrototypeOf(Object.getPrototypeOf(this)).initialize.apply(this, arguments);
                var that = this,
                    collectionManager = new CollectionManager();

                $(window).resize(function () {
                    that.setSideBarHeight();
                });

                this._accordionContentHeight = null;
                this._accordionHeightTries = 0;
                this.visualizationItems = new Backbone.Collection();
                this.num_items = 3;

                collectionManager.getDiscussionModelPromise()
                    .then(function(discussion) {

                    var settings = discussion.get('settings'),
                        jed;

                    try {
                        // temporary hack
                        var visualization_items = settings.navigation_sections[0].navigation_content.items;
                        if (visualization_items.length === 0)
                            return;
                        try {
                            jed = new Jed(settings['translations'][assembl_locale]);
                        } catch (e) {
                            // console.error(e);
                            jed = new Jed({});
                        }
                        that.visualizationItems.reset(_.map(visualization_items, function(item) {
                            return new Backbone.Model({
                                "url": item.url,
                                "title": jed.gettext(item.title),
                                "description": jed.gettext(item.description)
                            });
                        }));
                        that.num_items = 4;
                        that.ui.visualization_tab.show();
                    } catch (e) {
                        // console.log(e);
                    }
                }).delay(500).then(function() {that.setSideBarHeight();});
                this.listenTo(Assembl.vent, 'navigation:selected', this.toggleMenuByName);
            },
            onShow:function () {
              this.setSideBarHeight();
            },
            toggleMenuByName: function (itemName) {
                var elm = this.$('.nav[data-view=' + itemName + ']');
                this.toggleMenuByElement(elm);
            },
            toggleMenuByEvent: function (evt) {
                if ($(evt.target).hasClass("panel-header-minimize"))
                    return;
                var elm = $(evt.currentTarget), // use currentTarget instead of target, so that we are sure that it is a .nav element
                    view = elm.attr('data-view');
                Assembl.vent.trigger("navigation:selected", view);
            },
            /**
             * Toggle a navigation accordion item
             * @param  {jQuery selection of a DOM element} elm
             */
            toggleMenuByElement: function (elm) {
                var view = elm.attr('data-view');

                if (elm.next(this.ui.level).is(':hidden')) {
                    this.$('.nav').next('div:visible').slideUp();
                    this.$('.nav').removeClass('active');
                    elm.addClass('active');
                    elm.next(this.ui.level).slideDown();

                    this.loadView(view);
                }
            },
            setSideBarHeight: function () {
                var that = this;
                this.initVar();

                //setTimeout(function(){
                    that.ui.level.height(that._accordionContentHeight);
                //}, 0);
                
            },
            loadView: function (view) {
                // clear aspects of current state
                switch (this.getContainingGroup().model.get('navigationState')) {
                    case 'synthesis':
                        var messageListView = this.getContainingGroup().findViewByType(PanelSpecTypes.MESSAGE_LIST);
                        if (messageListView) {
                            messageListView.currentQuery.clearAllFilters();
                            if (view === 'debate') {
                              messageListView.render();
                            }
                        }
                        break;
                }
                this.getContainingGroup().model.set('navigationState', view);
                // set new state
                switch (view) {
                    case 'home':
                        var homePanel = new HomePanel({
                            groupContent: this.getContainingGroup(),
                            panelWrapper: this.getPanelWrapper()
                        });
                        this.home.show(homePanel);
                        this.getContainingGroup().resetContextState();
                        break;
                    case 'debate':
                        var idealist = new IdeaList({
                            groupContent: this.getContainingGroup(),
                            panelWrapper: this.getPanelWrapper(),
                            nav: true
                        });
                        this.debate.show(idealist);
                        if ( this.getContainingGroup().getCurrentIdea() ) {
                            this.getContainingGroup().resetDebateState();
                        }
                        else {
                            var that = this;
                            var collectionManager = new CollectionManager();
                            collectionManager.getDiscussionModelPromise().then(function (discussion){
                                if ( discussion.get("show_help_in_debate_section") ){
                                    that.getContainingGroup().resetDebateState(false, true);
                                }
                                else {
                                    that.getContainingGroup().resetDebateState();
                                }
                            });
                        }
                        break;
                    case 'synthesis':
                        var synthesisInNavigationPanel = new SynthesisInNavigationPanel({
                            groupContent: this.getContainingGroup(),
                            panelWrapper: this.getPanelWrapper()
                        });
                        this.synthesis.show(synthesisInNavigationPanel);
                        this.getContainingGroup().resetSynthesisMessagesState(synthesisInNavigationPanel);
                        break;
                    case 'visualizations':
                        var visualizationListPanel = new LinkListView({
                            groupContent: this.getContainingGroup(),
                            collection: this.visualizationItems
                        });
                        this.visualizationList.show(visualizationListPanel);
                        break;
                    default:
                        break
                }
            },

            // This method needs the DOM elements of the View to be rendered. So it should not be called in onRender(), but rather in onShow() or onDomRefresh()
            initVar: function () {
                // check wether DOM elements are already rendered

                var _header = $('#header').height(),
                    _window = $(window).height(),
                    _li = this.li_height * this.num_items,
                    _headerGroup = ($(".groupHeader").first().hasClass('editable')) ? this.group_editable_header_height : this.group_header_height,
                    _sideBarHeight = (_window - _header) - _headerGroup,
                    that = this;

                if (this.$el && this.$el.parent() && this.$el.parent().height()) {
                    this._accordionContentHeight = _sideBarHeight - _li - 2;
                }
                else { // fallback: set an initial estimation
                    this._accordionContentHeight = _sideBarHeight - _li - 2;

                    if (++this._accordionHeightTries < 10){ // prevent infinite loop
                        setTimeout(function () {
                            that.setSideBarHeight();
                        }, 100);
                    }
                }

            },

            serializeData: function () {
                return {
                    Ctx: Ctx,
                    hasMinimize: (Ctx.getCurrentInterfaceType() === Ctx.InterfaceTypes.EXPERT),
                    canAdd: Ctx.getCurrentUser().can(Permissions.ADD_IDEA)
                }
            },

            addIdeaFromIdeaList: function () {
                Assembl.vent.trigger('ideaList:addChildToSelected');
            }


        });

        return NavigationView;
    });
