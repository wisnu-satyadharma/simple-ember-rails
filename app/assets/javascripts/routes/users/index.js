App.UsersRoute = Ember.Route.extend({
  model: function() { return this.store.findAll('user'); }
})