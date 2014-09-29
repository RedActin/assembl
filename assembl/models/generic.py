from datetime import datetime

from sqlalchemy.orm import relationship, backref
from sqlalchemy import (
    Column,
    Integer,
    Boolean,
    UnicodeText,
    String,
    DateTime,
    ForeignKey,
)

from . import DiscussionBoundBase
from ..semantic.virtuoso_mapping import QuadMapPatternS
from ..auth import (
    CrudPermissions, P_ADD_POST, P_READ, P_EDIT_POST, P_ADMIN_DISC,
    P_EDIT_POST, P_ADMIN_DISC)
from ..lib.sqla import (INSERT_OP, UPDATE_OP, get_model_watcher)
from ..semantic.namespaces import  SIOC, CATALYST, IDEA, ASSEMBL, DCTERMS, QUADNAMES
from .discussion import Discussion
#from ..lib.history_meta import Versioned

class ContentSource(DiscussionBoundBase):
    """
    A ContentSource is where any outside content comes from. .
    """
    __tablename__ = "content_source"
    rdf_class = SIOC.Container

    id = Column(Integer, primary_key=True,
                info= {'rdf': QuadMapPatternS(None, ASSEMBL.db_id)})
    name = Column(UnicodeText, nullable=False)
    type = Column(String(60), nullable=False)

    creation_date = Column(DateTime, nullable=False, default=datetime.utcnow,
        info={'rdf': QuadMapPatternS(None, DCTERMS.created)})

    discussion_id = Column(Integer, ForeignKey(
        'discussion.id',
        ondelete='CASCADE',
        onupdate='CASCADE'
    ))

    @classmethod
    def special_quad_patterns(cls, alias_manager):
        return [
            QuadMapPatternS(
                Discussion.iri_class().apply(cls.discussion_id),
                CATALYST.uses_source,
                cls.iri_class().apply(cls.id),
                name=QUADNAMES.uses_source,
                condition=cls.discussion_id != None),
        ]

    discussion = relationship(
        "Discussion",
        backref=backref('sources', order_by=creation_date)
    )

    __mapper_args__ = {
        'polymorphic_identity': 'content_source',
        'polymorphic_on': type,
        'with_polymorphic': '*'
    }

    def serializable(self):
        return {
            "@id": self.uri_generic(self.id),
            "@type": self.external_typename(),
            "name": self.name,
            "creation_date": self.creation_date.isoformat(),
            "discussion_id": self.discussion_id
        }

    def __repr__(self):
        return "<ContentSource %s>" % repr(self.name)

    def import_content(self, only_new=True):
        pass

    def get_discussion_id(self):
        return self.discussion_id

    @classmethod
    def get_discussion_condition(cls, discussion_id):
        return cls.discussion_id == discussion_id

    crud_permissions = CrudPermissions(P_ADMIN_DISC)

class PostSource(ContentSource):
    """
    A Discussion PostSource is where commentary that is handled in the form of
    Assembl posts comes from.

    A discussion source should have a method for importing all content, as well
    as only importing new content. Maybe the standard interface for this should
    be `source.import()`.
    """
    __tablename__ = "post_source"
    rdf_class = ASSEMBL.PostSource

    id = Column(Integer, ForeignKey(
        'content_source.id',
        ondelete='CASCADE',
        onupdate='CASCADE'
    ), primary_key=True)

    last_import = Column(DateTime)

    __mapper_args__ = {
        'polymorphic_identity': 'post_source',
    }

    def serializable(self):
        ser = super(PostSource, self).serializable()
        ser["last_import"] = \
            self.last_import.isoformat() if self.last_import else None
        return ser

    def __repr__(self):
        return "<PostSource %s>" % repr(self.name)

    def import_content(self, only_new=True):
        pass

    def get_discussion_id(self):
        return self.discussion_id

    @classmethod
    def get_discussion_condition(cls, discussion_id):
        return cls.discussion_id == discussion_id

    def send_post(self, post):
        """ Send a new post in the discussion to the source. """
        raise "Source %s did not implement PostSource::send_post() "\
            % self.__class__.__name__


class AnnotatorSource(ContentSource):
    """
    A source of content coming from annotator
    """
    __tablename__ = "annotator_source"

    id = Column(Integer, ForeignKey(
        'content_source.id',
        ondelete='CASCADE',
        onupdate='CASCADE'
    ), primary_key=True)

    __mapper_args__ = {
        'polymorphic_identity': 'annotator_source',
    }


class Content(DiscussionBoundBase):
    """
    Content is a polymorphic class to describe what is imported from a Source.
    """
    __tablename__ = "content"
    rdf_class = SIOC.Post

    id = Column(Integer, primary_key=True,
                info= {'rdf': QuadMapPatternS(None, ASSEMBL.db_id)})
    type = Column(String(60), nullable=False)
    creation_date = Column(DateTime, nullable=False, default=datetime.utcnow,
        info= {'rdf': QuadMapPatternS(None, DCTERMS.created)})

    discussion_id = Column(Integer, ForeignKey(
        'discussion.id',
        ondelete='CASCADE',
        onupdate='CASCADE',
    ),
        nullable=False,)

    discussion = relationship(
        "Discussion",
        backref=backref('posts', order_by=creation_date)
    )

    hidden = Column(Boolean, server_default='0')

    __mapper_args__ = {
        'polymorphic_identity': 'content',
        'polymorphic_on': 'type',
        'with_polymorphic': '*'
    }

    def __init__(self, *args, **kwargs):
        super(Content, self).__init__(*args, **kwargs)

    def __repr__(self):
        return "<Content %s>" % repr(self.type)

    def get_body(self):
        return ""

    def get_body_mime_type(self):
        """ Return the format of the body, so the frontend will know how to 
        display it.  Currently, only:
        text/plain (Understood as preformatted text)
        text/html (Undestood as some subste of html)
        """
        return "text/plain"

    def get_title(self):
        return ""

    def send_to_changes(self, connection=None, operation=UPDATE_OP):
        super(Content, self).send_to_changes(connection, operation)
        watcher = get_model_watcher()
        if operation == INSERT_OP:
            watcher.processPostCreated(self.id)

    def get_discussion_id(self):
        return self.discussion_id

    @classmethod
    def get_discussion_condition(cls, discussion_id):
        return cls.discussion_id == discussion_id

    widget_idea_links = relationship('IdeaContentWidgetLink')

    def widget_ideas(self):
        from .idea import Idea
        return [Idea.uri_generic(wil.idea_id) for wil in self.widget_idea_links]

    crud_permissions = CrudPermissions(
            P_ADD_POST, P_READ, P_EDIT_POST, P_ADMIN_DISC,
            P_EDIT_POST, P_ADMIN_DISC)
