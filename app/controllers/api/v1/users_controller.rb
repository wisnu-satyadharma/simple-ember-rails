class Api::V1::UsersController < ApplicationController

  def index
    users = User.all
    render json: {user: users}.to_json
  end

  def show
  	user = User.find(params[:id])
  	render json: {user: user}.to_json  	
  end

  def update
  	user = User.find(params[:id])
  	user.update_attributes(user_params)
  	render json: {user: user}.to_json  	 	
  end

  def destroy
  	user = User.find(params[:id])
  	user.destroy
  	render json: {user: nil}.to_json
  end

  def create
    user = User.create(user_params)
    render json: {user: user}.to_json
  end

  private
  def user_params
  	params.require(:user).permit(:first_name, :last_name, :email)
  end

end