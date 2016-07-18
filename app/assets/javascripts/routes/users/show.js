App.UsersRoute = Ember.Route.extend({
   model: function(params, transitions) { 
   	return this.store.query('user', params); 
   }
})