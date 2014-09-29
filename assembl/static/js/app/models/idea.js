define(function(require){
    'use strict';

    var Base = require('models/base'),
           _ = require('underscore'),
         Ctx = require('modules/context'),
        i18n = require('utils/i18n'),
       Types = require('utils/types'),
 Permissions = require('utils/permissions');

    /**
     * @class IdeaModel
     */
    var IdeaModel = Base.Model.extend({

        /**
         * @init
         */
        initialize: function(obj){
            obj = obj || {};
            var that = this;

            obj.creationDate = obj.creationDate || Ctx.getCurrentTime();
            this.set('creationDate', obj.creationDate);
            this.set('hasCheckbox', Ctx.getCurrentUser().can(Permissions.EDIT_SYNTHESIS));

        },

        /**
         * Url
         * @type {String}
         */
        urlRoot: Ctx.getApiUrl("ideas"),

        /**
         * Defaults
         */
        defaults: {
            shortTitle: i18n.gettext('New idea'),
            longTitle: '',
            definition: '',
            numChildIdea: 0,
            num_posts: 0,
            num_read_posts: 0,
            isOpen: true,
            hidden: false,
            hasCheckbox: false,
            featured: false,
            active: false,
            inNextSynthesis: false,
            parentId: null,
            order: 1
        },
        /* The following should be mostly in view code, but currently the
         * longTitle editor code isn't common in ideaPanel and synthesisView
         * At least this is mostly DRY
         */

        /**
         * Returns the display text for a idea definition.
         * Will return the first non-empty from:
         * definition, longTitle, i18n.gettext('Add a definition for this idea')
         * @param
         * @return {Text>}
         */
        getDefinitionDisplayText: function(){
            if (this.get('root') === true) {
                return i18n.gettext('The root idea will not be in the synthesis');
            }

            if( Ctx.stripHtml(this.get('definition')) !== '' ){
                return this.get('definition');
            } else if( Ctx.stripHtml(this.get('longTitle')) !== '' ){
                return this.get('longTitle');
            } else {
                return i18n.gettext('Add a description of this idea');
            }
        },

        /**
         * Returns the display text for a idea synthesis expression.
         * Will return the first non-empty from:
         * longTitle, shortTitle, i18n.gettext('Add and expression for the next synthesis')
         * @param
         * @return {Text>}
         */
        getLongTitleDisplayText: function(){
            if (this.get('root') === true) {
                return i18n.gettext('The root idea will never be in the synthesis');
            }

            if( Ctx.stripHtml(this.get('longTitle')) !== '' ){
                return this.get('longTitle');
            } else if ( Ctx.stripHtml(this.get('shortTitle')) !== '' ){
                return this.get('shortTitle');
            } else {
                return i18n.gettext('Add and expression for the next synthesis');
            }
        },

        /**
         * @return {String} The short Title to be displayed
         */
        getShortTitleDisplayText: function(){
            return this.isRootIdea() ? i18n.gettext('All posts') : this.get('shortTitle');
        },

        /**
         * @return {Boolean} true if the current idea is the root idea
         */
        isRootIdea: function(){
            return this.get('@type') === Types.ROOT_IDEA;
        },

        /**
         * Adds an idea as child
         * @param  {Idea} idea
         */
        addChild: function(idea){
            this.collection.add(idea);

            if( this.isDescendantOf(idea) ){
                this.save('parentId', null);
            }

            idea.save({
                'order':this.getOrderForNewChild(),
                'parentId': this.getId()
            });
        },

        /**
         * Adds an idea as sibling above
         * @param {Idea} idea
         */
        addSiblingAbove: function(idea){
            var parent = this.getParent(),
                parentId = parent ? parent.getId() : null,
                index = this.collection.indexOf(this),
                order = this.get('order') - 0.1;

            this.collection.add(idea, { at: index });
            idea.attributes.parentId = parentId;
            idea.attributes.order = order;
            idea.trigger('change:parentId');

            if( parent ){
              parent.updateChildrenOrder();
            } else {
              this.collection.updateRootIdeasOrder();
            }
        },

        /**
         * Adds an idea as sibling below
         * @param {Idea} idea
         */
        addSiblingBelow: function(idea){
            var parent = this.getParent(),
                parentId = parent ? parent.getId() : null,
                index = this.collection.indexOf(this) + 1,
                order = this.get('order') + 0.1;

            this.collection.add(idea, { at: index });
            idea.attributes.parentId = parentId;
            idea.attributes.order = order;
            idea.trigger('change:parentId');

            if( parent ){
              parent.updateChildrenOrder();
            } else {
              this.collection.updateRootIdeasOrder();
            }
        },

        /**
         * Return all children
         * @return {Idea[]}
         */
        getChildren: function(){
            return this.collection.where({ parentId: this.getId() });
        },

        /**
         * Return the parent idea
         * @return {Idea}
         */
        getParent: function(){
            return this.collection.findWhere({ '@id': this.get('parentId') });
        },

        /**
         * Return all children which belongs to the synthesis
         * @return {Idea[]}
         */
        getSynthesisChildren: function(){
            var children = this.collection.where({ parentId: this.getId() }),
                result = [];

            _.each(children, function(child){
                if( child.get('inNextSynthesis') === true ){
                    result.push(child);
                } else {
                    result = _.union(result, child.getSynthesisChildren());
                }
            });

            return result;
        },

        /**
         * Return if the idea is descendant of the given idea
         * @param {Idea} idea
         * @return {Boolean}
         */
        isDescendantOf: function(idea){
            var parentId = this.get('parentId');

            if( parentId === idea.getId() ){
                return true;
            }

            return parentId === null ? false : this.getParent().isDescendantOf(idea);
        },

        /**
         * @return {Number} the indentantion level
         */
        getLevel: function(){
            var counter = 0,
                parent = this;
            do {
                if (parent.get('root') === true)
                    break;
                parent = parent.get('parentId') !== null ? parent.getParent() : null;
                counter += 1;
            } while ( parent !== null );

            return counter;
        },


        visitDepthFirst: function(visitor, ancestry) {
            if (ancestry === undefined) {
                ancestry = [];
            }
            if (visitor(this, ancestry)) {
                ancestry = ancestry.slice(0);
                ancestry.push(this);
                var children = _.sortBy(this.getChildren(), function(child){ return child.get('order'); });
                for (var i in children) {
                    children[i].visitDepthFirst(visitor, ancestry);
                }
            }
        },

        visitBreadthFirst: function(visitor, ancestry) {
            var continue_visit = true
            if (ancestry === undefined) {
                ancestry = [];
                continue_visit = visitor(this, ancestry);
            }
            if (continue_visit) {
                ancestry = ancestry.slice(0);
                ancestry.push(this);
                var children = _.sortBy(this.getChildren(), function(child){ return child.get('order'); });
                var children_to_visit = [];
                for (var i in children) {
                    var child = children[i];
                    if (visitor(child, ancestry)) {
                        children_to_visit.push(child);
                    }
                }
                for (var i in children_to_visit) {
                    children_to_visit[i].visitBreadthFirst(visitor, ancestry);
                }
            }
        },

        /**
         * @return {Number} The order number for a new child
         */
        getOrderForNewChild: function(){
            return this.getChildren().length + 1;
        },

        /** Return a promise for all Extracts models for this idea
         * @return {$.Defered.Promise}
         */
        getExtractsPromise: function(){
          var that = this,
          deferred = $.Deferred();
          this.collection.collectionManager.getAllExtractsCollectionPromise().done(
              function(allExtractsCollection) {
                var extracts = allExtractsCollection.where({idIdea:that.getId()});
                deferred.resolve(extracts);
              }
          );
          return deferred.promise();
        },

        /**
         * Adds a segment
         * @param  {Segment} segment
         */
        addSegment: function(segment){
            segment.set('idIdea', this.getId());
            segment.save();
        },

        /**
         * Adds a segment as a child
         * @param {Segment} segment, possibly unsaved.
         * @return the newly created idea
         */
        addSegmentAsChild: function(segment){
            // Cleaning
            delete segment.attributes.highlights;

            var data = {
                shortTitle: segment.getQuote().substr(0, 50),
                longTitle: segment.getQuote(),
                parentId: this.getId(),
                order: this.getOrderForNewChild()
            };

            var onSuccess = function(idea){
                //console.log('addSegmentAsChild(): onSuccess() fired.')
                idea.addSegment(segment);
            };

            return this.collection.create(data, { success: onSuccess });
        },

        /**
         * Updates the order in all children
         */
        updateChildrenOrder: function(){
            var children = _.sortBy(this.getChildren(), function(child){ return child.get('order'); }),
                currentOrder = 1;

            _.each(children, function(child){
                child.save('order', currentOrder);
                currentOrder += 1;
            });
        },

        set: function(key, val, options) {
            if (typeof key === 'object') {
              var attrs = key;
              options = val;
              if (attrs['parentId'] === null && this.id !== undefined && attrs['root'] !== true) {
                console.log("empty parent bug: ", _.clone(attrs));
                var id = attrs['@id'];
                var links = this.collection.collectionManager._allIdeaLinksCollection.where({target: id});
                if (links.length > 0) {
                    console.log('corrected');
                    attrs['parents'] = _.map(links, function(l) {return l.get('source')});
                    attrs['parentId'] = attrs['parents'][0];
                }
              }
              return Backbone.Model.prototype.set.call(this, attrs, options);
            } else {
                return Backbone.Model.prototype.set.call(this, key, val, options);
            }
        },

        getVotableOnWhichWidgets: function(){
            var widget_data = this.get('widget_data');
            var widgets = _.filter(widget_data, function(o){
                return o["@type"] == "votable";
            });
           return widgets;
        }

    });

    /**
     * @class IdeaColleciton
     */
    var IdeaCollection = Base.Collection.extend({
        /**
         * Url
         * @type {String}
         */
        url: Ctx.getApiUrl("ideas"),

        /**
         * The model
         * @type {IdeaModel}
         */
        model: IdeaModel,

        /**
         * @return {Idea} The root idea
         */
        getRootIdea: function(){
            var retval = this.findWhere({ '@type': Types.ROOT_IDEA });
            if (!retval) {
                console.log("Size: ", _.size(this.models));
                _.forEach(this.models, function(model){
                    console.log(model.get('@type'));
                })
                console.log("ERROR: getRootIdea() failed!");
                console.log(this);
            }
            return retval;
        },
        
        /**
         * Returns the order number for a new root idea
         * @return {Number}
         */
        getOrderForNewRootIdea: function(){
            var lastIdea = this.last();
            return lastIdea ? lastIdea.get('order') + 1 : 0;
        },
        
        /**
         * Updates the order in the idea list
         */
        updateRootIdeasOrder: function(){
            var children = this.where({ parentId: null }),
                currentOrder = 1;

            _.each(children, function(child){
                child.set('order', currentOrder);
                child.save();
                currentOrder += 1;
            });
        }
        
    });

    return {
        Model: IdeaModel,
        Collection: IdeaCollection
    };

});
