from django.conf.urls import url, include
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from webapp import views as webapp_views

urlpatterns = [
    #url(r'', include('user_sessions.urls', 'user_sessions')),
    url(r'', include('two_factor.urls', 'two_factor')),
    url(r'^admin/logout/', webapp_views.logout),
    url(r'^admin/', admin.site.urls),
    url(r'^$', webapp_views.index, name='index'),
    url(r'^data/(?P<sensor>\d+)/(?P<start>\d+)/(?P<end>\d+)/(?P<scale>\d+)/$', webapp_views.get_json),
] + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)