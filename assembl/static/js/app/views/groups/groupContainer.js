define(function (require) {

    var Marionette = require('marionette'),
        Assembl = require('modules/assembl'),
        GroupContent = require('views/groups/groupContent'),
        Notification = require('views/notification'),
        $ = require('jquery');
    /**
     * Manages all the groups in the interface
     */
    var groupContainer = Marionette.CollectionView.extend({
        id: 'groupsContainer',
        childView: GroupContent,
        _minimizedPanelWidth: 40,
        initialize: function (options) {
            // boilerplate in marionette if you listen m/c here, use collectionEvents or modelEvents
            //this.listenTo(this.collection, 'change reset add remove', this.calculateGridSize);
            var that = this;
            $( window ).resize(function() { that.onWindowResize(); });
        },
        onRender: function () {
            if (window.localStorage.getItem('showNotification')) {
                this.$el.addClass('hasNotification');
                Assembl.notificationRegion.show(new Notification());
            }
        },
        collectionEvents: {
            'change reset add remove': 'calculateGridSize'
        },
        calculateGridSize: function () {
            var that = this, gridSize = 0;
            this.collection.each(function (aGroupSpec) {
                var view = that.children.findByModel(aGroupSpec);
                if (view)
                    gridSize += view.calculateGridSize();
            });
            var className = 'allGroupsGridSize-' + gridSize;
            var found = this.$el[0].className.match(/\b(allGroupsGridSize-[0-9]+)\b/);
            if (found && found[0] != className) {
                this.$el.removeClass(found[0]);
            }
            if ((!found) || found[0] != className) {
                this.$el.addClass(className);
            }
            this.resizeAllPanels(false);
        },

        onWindowResize: function(){
            console.log("onWindowResize()");
            this.resizeAllPanels(false);
        },

        resizeAllPanels: function(with_animation){
            console.log("groupContainer::resizeAllPanels()");
            var animation_time = 1000;
            if ( with_animation === false )
                animation_time = 10;

            var elGroupContent = $("#groupsContainer .groupContent");
            var elVisiblePanels = $("#groupsContainer .groupContent .groupBody .groupPanel:visible");
            var elMinimizedPanels = $("#groupsContainer .groupContent .groupBody .groupPanel.minimized:visible");

            // detect wether the UI is in the following configuration: single group which exactly has panels Navigation + Idea + Messages
            // in this case, resizing the idea panel does not resize the navigation panel
            var specialCase = false;
            if ( elGroupContent.length == 1
                && elVisiblePanels.length == 3
                && !Ctx.userCanChangeUi()
                && $("#groupsContainer .groupContent .groupBody .groupPanel .ideaPanel").length
            ) {
                console.log("we are in the N+I+M case");
                specialCase = true;
            }

            // extract int 4 from string "panelGridWidth-4"
            // el: jQuery selection
            var getPanelGridSize = function(el){
                return parseInt(el.attr("class").match(/panelGridWidth-(\d+)/)[1]);
            };


            var extra_pixels = 
                elGroupContent.length * 3 // left border of each .groupContent
                + Math.max(0, elGroupContent.length -1) * 2 // right border of each .groupContent except the last one
                //+ elVisiblePanels.length * 3 // right border of each visible .groupPanel
                + elMinimizedPanels.length * this._minimizedPanelWidth // width of each minimized panel (without borders)
            ;
            console.log("extra_pixels:",extra_pixels);
            console.log("elGroupContent:",elGroupContent);
            console.log("elGroupContent.length:",elGroupContent.length);
            console.log("elVisiblePanels:",elVisiblePanels);
            console.log("elVisiblePanels.length:",elVisiblePanels.length);
            console.log("elMinimizedPanels:",elMinimizedPanels);
            console.log("elMinimizedPanels.length:",elMinimizedPanels.length);
            var window_width = $(window).width();
            //var total_grid_width = parseInt($("#groupsContainer").attr("class").match(/\d+/)[0]);
            
            var used_panels = $("#groupsContainer .groupContent .groupBody .groupPanel:visible:not(.minimized)");
            console.log("used_panels:", used_panels);
            var total_grid_unit_width = 0;
            var total_available_pixel_width = 0;//window_width - extra_pixels;
            
            
            // el is a jQuery selection
            var updateElementWidth = function(el){
                console.log("updateElementWidth el:",el);
                var panel_unit_width = getPanelGridSize(el);
                var ratio = panel_unit_width / total_grid_unit_width;
                var targetWidth = ratio * total_available_pixel_width;
                console.log("targetWidth: ", targetWidth);
                el.animate({ "width": targetWidth+"px"}, animation_time);
            };
            

            if ( specialCase )
            {
                /*
                var navigation_panel = $("#groupsContainer .groupContent .groupBody .groupPanel:first-child");
                var messages_panel = this.$el.nextAll(":visible:not(.minimized)").last();
                var idea_panel = this.$el;
                var navigation_panel_width = navigation_panel.width();
                
                console.log("nav panel width:",navigation_panel.css('width'));
                / *if ( !navigation_panel.hasClass('fixedwidth') ){ // if we set it everytime, we loose 1px each time, I don't know why
                    navigation_panel.addClass('fixedwidth');
                    navigation_panel.width(navigation_panel_width);
                }* /
                navigation_panel.width(navigation_panel_width+1); // we loose 1px, I don't know why
                if ( this.model.get('minimized') ){
                    total_available_pixel_width -= navigation_panel_width;
                    //total_available_pixel_width -= this._minimizedPanelWidth; // maybe not?
                    messages_panel.animate({ "width": total_available_pixel_width+"px"}, 1000);
                } else {
                    updateElementWidth(idea_panel);
                    updateElementWidth(messages_panel);
                }
                */
                


                used_panels = used_panels.slice(1); // remove the navigation panel from the set of panels to resize

                used_panels.each(function(index){
                    total_grid_unit_width += getPanelGridSize($(this));
                    total_available_pixel_width += $(this).width();
                });
                
                //var navigationPanel = $("#groupsContainer .groupContent .groupBody .groupPanel:first-child");
                //total_available_pixel_width -= (navigationPanel.width() + 3);
                //console.log("navigationPanel.width(): ", navigationPanel.width());
                //total_grid_unit_width -= getPanelGridSize(navigationPanel);
                
                
            }
            else
            {
                total_available_pixel_width = window_width - extra_pixels;
                used_panels.each(function(index){
                    total_grid_unit_width += getPanelGridSize($(this));
                    //total_available_pixel_width += $(this).width();
                });
                //console.log("total_available_pixel_width:",total_available_pixel_width);
            }


            used_panels.each(function(index){
                //console.log("this:",$(this));
                updateElementWidth($(this));
            });

            
            $("#groupsContainer .groupContent").each(function(index){
                //$(this).width("auto");
            });
        }
    });

    return groupContainer;
});