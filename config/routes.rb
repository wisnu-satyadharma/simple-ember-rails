Rails.application.routes.draw do
	get 'ember_app/index'
	root to: 'ember_app#index'
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
end
