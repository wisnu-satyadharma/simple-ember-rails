// For more information see: http://emberjs.com/guides/routing/

App.Router.map(function() {
   this.route('users', function() {
    this.route('index', { path: '/' });
  });
});
