App.UsersEditRoute = Ember.Route.extend({
  model: function(params, transitions) {
  
 	  // return this.store.query('user', params); 
  },
  actions:{
		update(user) {
      user.save().then(() => this.transitionTo('users'));
    },

    willTransition(transition) {

      let model = this.controller.get('model');

      if (model.get('hasDirtyAttributes')) {
        let confirmation = confirm("Your changes haven't saved yet. Would you like to leave this form?");

        if (confirmation) {
          model.rollbackAttributes();
        } else {
          transition.abort();
        }
      }
    }  	
  }
})