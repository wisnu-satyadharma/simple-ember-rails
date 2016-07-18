App.UsersIndexController = Ember.Controller.extend({
	actions: {
		delete: function(user) {
			alert('sampe');
			user.destroyRecord();
		}	
	}
})