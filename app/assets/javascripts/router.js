// For more information see: http://emberjs.com/guides/routing/

App.Router.map(function() {
  this.route('users', function() {
    this.route('index', { path: '/' });
    this.route('show', { path: '/:user_id' });
    this.route('edit', { path: '/:user_id/edit' });
    this.route('new', { path: '/new' });
  });
});
