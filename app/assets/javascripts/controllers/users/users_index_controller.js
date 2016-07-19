App.UsersIndexController = Ember.Controller.extend({
	actions: {
		delete: function(user) {
			user.destroyRecord();
		}	
	}
});

App.UsersNewController = Ember.Controller.extend({
	actions: {
		save: function(model) {
			model.save().then(() => this.transitionToRoute('users'));
		}	
	}
})