
import logging
import sys
from datetime import datetime, timedelta

import pytest
from pytest_localserver.http import WSGIServer
from pyramid import testing
from pyramid.paster import get_appsettings
import transaction
from webtest import TestApp
from pkg_resources import get_distribution
import simplejson as json

import assembl
from assembl.lib.migration import bootstrap_db, bootstrap_db_data
from assembl.lib.sqla import get_session_maker
from assembl.tasks import configure as configure_tasks
from .utils import clear_rows, drop_tables
from assembl.auth import R_SYSADMIN, R_PARTICIPANT


@pytest.fixture(scope="session")
def app_settings(request):
    app_settings_file = request.config.getoption('test_settings_file')
    return get_appsettings(app_settings_file)


@pytest.fixture(scope="session")
def session_factory(request):
    session_factory = get_session_maker()

    def fin():
        session_factory.remove()
    request.addfinalizer(fin)
    return session_factory


@pytest.fixture(scope="session")
def empty_db(request, app_settings, session_factory):
    session = session_factory()
    drop_tables(app_settings, session)
    return session_factory


@pytest.fixture(scope="session")
def db_tables(request, empty_db, app_settings):
    app_settings_file = request.config.getoption('test_settings_file')
    assert app_settings_file
    from ..conftest import engine
    bootstrap_db(app_settings_file, engine)
    transaction.commit()

    def fin():
        session = empty_db()
        drop_tables(app_settings, session)
        transaction.commit()
    request.addfinalizer(fin)
    return empty_db  # session_factory


@pytest.fixture(scope="module")
def db_default_data(request, db_tables, app_settings):
    bootstrap_db_data(db_tables)
    transaction.commit()

    def fin():
        session = db_tables()
        clear_rows(app_settings, session)
        transaction.commit()
    request.addfinalizer(fin)
    return db_tables  # session_factory


@pytest.fixture(scope="function")
def test_session(request, db_default_data):
    session = db_default_data()

    def fin():
        session.rollback()
    request.addfinalizer(fin)
    return session

@pytest.fixture(scope="function")
def test_app_no_perm(request, app_settings):
    global_config = {
        '__file__': request.config.getoption('test_settings_file'),
        'here': get_distribution('assembl').location
    }
    app = TestApp(assembl.main(
        global_config, nosecurity=True, **app_settings))
    configure_tasks(app.app.registry, 'assembl')
    return app


@pytest.fixture(scope="function")
def discussion(request, test_session, test_app_no_perm):
    from assembl.models import Discussion
    d = Discussion(topic=u"Jack Layton", slug="jacklayton2")
    test_session.add(d)
    test_session.flush()

    def fin():
        test_session.delete(d)
    return d


@pytest.fixture(scope="function")
def admin_user(request, test_session):
    from assembl.models import User, UserRole, Role
    u = User(name=u"Mr. Adminstrator", type="user")
    test_session.add(u)
    r = Role.get_role(test_session, R_SYSADMIN)
    ur = UserRole(user=u, role=r)
    test_session.add(ur)
    test_session.flush()

    def fin():
        test_session.delete(u)
    return u


@pytest.fixture(scope="function")
def test_app(request, admin_user, app_settings, test_app_no_perm):
    config = testing.setUp(
        registry=test_app_no_perm.app.registry,
        settings=app_settings,
    )
    dummy_policy = config.testing_securitypolicy(
        userid=admin_user.id, permissive=True)
    config.set_authorization_policy(dummy_policy)
    config.set_authentication_policy(dummy_policy)
    return test_app_no_perm


@pytest.fixture(scope="function")
def test_server(request, test_app):
    server = WSGIServer(application=test_app.app)
    server.start()
    request.addfinalizer(server.stop)
    return server


@pytest.fixture(scope="function")
def participant1_user(request, test_session):
    from assembl.models import User, UserRole, Role
    u = User(name=u"A. Barking Loon", type="user")
    test_session.add(u)
    r = Role.get_role(test_session, R_PARTICIPANT)
    ur = UserRole(user=u, role=r)
    test_session.add(ur)
    test_session.flush()

    def fin():
        test_session.delete(u)
    return u


@pytest.fixture(scope="function")
def participant2_user(request, test_session):
    from assembl.models import User, UserRole, Role
    u = User(name=u"James T. Expert", type="user")
    test_session.add(u)
    r = Role.get_role(test_session, R_PARTICIPANT)
    ur = UserRole(user=u, role=r)
    test_session.add(ur)
    test_session.flush()

    def fin():
        test_session.delete(u)
    return u


@pytest.fixture(scope="function")
def mailbox(request, discussion, test_session):
    from assembl.models import Mailbox
    m = Mailbox(discussion=discussion)
    test_session.add(m)
    test_session.flush()

    def fin():
        test_session.delete(m)
    return m


@pytest.fixture(scope="function")
def jack_layton_mailbox(request, discussion, test_session):
    """ From https://dev.imaginationforpeople.org/redmine/projects/assembl/wiki/SampleDebate
    """
    import os
    from assembl.models import MaildirMailbox
    maildir_path = os.path.join(os.path.dirname(__file__),
                                'jack_layton_mail_fixtures_maildir')
    m = MaildirMailbox(discussion=discussion, name='Jack Layton fixture',
                       filesystem_path=maildir_path)
    m.do_import_content(m, only_new=True)
    test_session.add(m)
    test_session.flush()

    def fin():
        test_session.delete(m)
    return m


@pytest.fixture(scope="function")
def post_source(request, discussion, test_session):
    from assembl.models import PostSource
    ps = PostSource(
        discussion=discussion, name='a source', type='post_source')
    test_session.add(ps)
    test_session.flush()

    def fin():
        test_session.delete(ps)
    return ps


@pytest.fixture(scope="function")
def root_post_1(request, participant1_user, discussion, test_session):
    from assembl.models import Post
    p = Post(
        discussion=discussion, creator=participant1_user,
        subject=u"a root post", body=u"post body",
        type="post", message_id="msg1")
    test_session.add(p)
    test_session.flush()

    def fin():
        test_session.delete(p)
    return p


@pytest.fixture(scope="function")
def reply_post_1(request, participant2_user, discussion,
                 root_post_1, test_session):
    from assembl.models import Post
    p = Post(
        discussion=discussion, creator=participant2_user,
        subject=u"re1: root post", body=u"post body",
        type="post", message_id="msg2")
    test_session.add(p)
    test_session.flush()
    p.set_parent(root_post_1)
    test_session.flush()

    def fin():
        test_session.delete(p)
    return p


@pytest.fixture(scope="function")
def reply_post_2(request, participant2_user, discussion,
                 reply_post_1, test_session):
    from assembl.models import Post
    p = Post(
        discussion=discussion, creator=participant2_user,
        subject=u"re2: root post", body=u"post body",
        type="post", message_id="msg3")
    test_session.add(p)
    test_session.flush()
    p.set_parent(reply_post_1)
    test_session.flush()

    def fin():
        test_session.delete(p)
    return p


@pytest.fixture(scope="function")
def reply_post_3(request, participant2_user, discussion,
                 root_post_1, test_session):
    from assembl.models import Post
    p = Post(
        discussion=discussion, creator=participant2_user,
        subject=u"re2: root post", body=u"post body",
        type="post", message_id="msg4")
    test_session.add(p)
    test_session.flush()
    p.set_parent(root_post_1)
    test_session.flush()

    def fin():
        test_session.delete(p)
    return p


@pytest.fixture(scope="function")
def root_idea(request, discussion, test_session):
    from assembl.models import RootIdea
    i = RootIdea(short_title="the root", discussion=discussion)
    test_session.add(i)
    test_session.flush()

    def fin():
        test_session.delete(i)
    return i


@pytest.fixture(scope="function")
def subidea_1(request, discussion, root_idea, test_session):
    from assembl.models import Idea, IdeaLink
    i = Idea(short_title="idea 1", discussion=discussion)
    test_session.add(i)
    l_r_1 = IdeaLink(source=root_idea, target=i)
    test_session.add(l_r_1)
    test_session.flush()

    def fin():
        test_session.delete(i)
        test_session.delete(l_r_1)
    return i


@pytest.fixture(scope="function")
def subidea_1_1(request, discussion, subidea_1, test_session):
    from assembl.models import Idea, IdeaLink
    i = Idea(short_title="idea 1.1", discussion=discussion)
    test_session.add(i)
    l_1_11 = IdeaLink(source=subidea_1, target=i)
    test_session.add(l_1_11)
    test_session.flush()

    def fin():
        test_session.delete(i)
        test_session.delete(l_1_11)
    return i


@pytest.fixture(scope="function")
def criterion_1(request, discussion, subidea_1, test_session):
    from assembl.models import Criterion, IdeaLink
    i = Criterion(short_title="cost", discussion=discussion)
    test_session.add(i)
    l_1_11 = IdeaLink(source=subidea_1, target=i)
    test_session.add(l_1_11)
    test_session.flush()

    def fin():
        test_session.delete(i)
        test_session.delete(l_1_11)
    return i


@pytest.fixture(scope="function")
def criterion_2(request, discussion, subidea_1, test_session):
    from assembl.models import Criterion, IdeaLink
    i = Criterion(short_title="quality", discussion=discussion)
    test_session.add(i)
    l_1_11 = IdeaLink(source=subidea_1, target=i)
    test_session.add(l_1_11)
    test_session.flush()

    def fin():
        test_session.delete(i)
        test_session.delete(l_1_11)
    return i


@pytest.fixture(scope="function")
def criterion_3(request, discussion, subidea_1, test_session):
    from assembl.models import Criterion, IdeaLink
    i = Criterion(short_title="time", discussion=discussion)
    test_session.add(i)
    l_1_11 = IdeaLink(source=subidea_1, target=i)
    test_session.add(l_1_11)
    test_session.flush()

    def fin():
        test_session.delete(i)
        test_session.delete(l_1_11)
    return i


@pytest.fixture(scope="function")
def lickert_range(request, test_session):
    from assembl.models import LickertRange
    lr = LickertRange()
    test_session.add(lr)
    test_session.flush()

    def fin():
        test_session.delete(lr)
    return lr


@pytest.fixture(scope="function")
def subidea_1_1_1(request, discussion, subidea_1_1, test_session):
    from assembl.models import Idea, IdeaLink
    i = Idea(short_title="idea 1.1.1", discussion=discussion)
    test_session.add(i)
    l_11_111 = IdeaLink(source=subidea_1_1, target=i)
    test_session.add(l_11_111)
    test_session.flush()

    def fin():
        test_session.delete(i)
        test_session.delete(l_11_111)
    return i


@pytest.fixture(scope="function")
def synthesis_1(request, discussion, subidea_1, subidea_1_1, test_session):
    from assembl.models import Synthesis, SubGraphIdeaAssociation,\
        SubGraphIdeaLinkAssociation
    s = Synthesis(discussion=discussion)
    test_session.add(s)
    i1_a = SubGraphIdeaAssociation(sub_graph=s, idea=subidea_1)
    test_session.add(i1_a)
    i11_a = SubGraphIdeaAssociation(sub_graph=s, idea=subidea_1_1)
    test_session.add(i11_a)
    l_1_11 = subidea_1_1.source_links[0]
    l_1_11_a = SubGraphIdeaLinkAssociation(sub_graph=s, idea_link=l_1_11)
    test_session.add(l_1_11_a)
    test_session.flush()

    def fin():
        test_session.delete(i1_a)
        test_session.delete(i11_a)
        test_session.delete(l_1_11_a)
        test_session.delete(s)

    return s


@pytest.fixture(scope="function")
def extract_post_1_to_subidea_1_1(
        request, participant2_user, reply_post_1,
        subidea_1_1, discussion, test_session):
    """ Links reply_post_1 to subidea_1_1 """
    from assembl.models import Extract
    e = Extract(
        body=u"body",
        creator=participant2_user,
        owner=participant2_user,
        content=reply_post_1,
        idea_id=subidea_1_1.id,  # strange bug: Using idea directly fails
        discussion=discussion)
    test_session.add(e)
    test_session.flush()

    def fin():
        test_session.delete(e)
    return e


@pytest.fixture(scope="function")
def creativity_session_widget(
        request, test_session, discussion, subidea_1):
    from assembl.models import CreativitySessionWidget
    test_session.flush()
    c = CreativitySessionWidget(
        discussion=discussion,
        settings=json.dumps({
            'idea': subidea_1.uri(),
            'notifications': [
                {
                    'start': '2014-01-01T00:00:00',
                    'end': format(datetime.now() + timedelta(1)),
                    'message': 'creativity_session'
                }
            ]}))
    test_session.add(c)

    def fin():
        test_session.delete(c)

    return c


@pytest.fixture(scope="function")
def creativity_session_widget_new_idea(
        request, test_session, discussion, subidea_1,
        creativity_session_widget, participant1_user):
    from assembl.models import (Idea, IdeaLink, GeneratedIdeaWidgetLink,
                                IdeaProposalPost)
    i = Idea(
        discussion=discussion,
        short_title="generated idea")
    test_session.add(i)
    l_1_wi = IdeaLink(source=subidea_1, target=i)
    test_session.add(l_1_wi)
    l_w_wi = GeneratedIdeaWidgetLink(
        widget=creativity_session_widget,
        idea=i)
    ipp = IdeaProposalPost(
        proposes_idea=i, creator=participant1_user, discussion=discussion,
        message_id='proposal', subject=u"propose idea", body="")
    test_session.add(ipp)
    def fin():
        test_session.delete(ipp)
        test_session.delete(l_w_wi)
        test_session.delete(l_1_wi)
        test_session.delete(i)

    return i


@pytest.fixture(scope="function")
def creativity_session_widget_post(
        request, test_session, discussion, participant1_user,
        creativity_session_widget, creativity_session_widget_new_idea):
    from assembl.models import (Post, IdeaContentWidgetLink)
    p = Post(
        discussion=discussion, creator=participant1_user,
        subject=u"re: generated idea", body=u"post body",
        type="post", message_id="comment_generated")
    test_session.add(p)
    test_session.flush()
    icwl = IdeaContentWidgetLink(
        content=p, idea=creativity_session_widget_new_idea,
        creator=participant1_user)
    test_session.add(icwl)

    def fin():
        test_session.delete(icwl)
        test_session.delete(p)

    return i
