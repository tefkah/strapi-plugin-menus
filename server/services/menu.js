'use strict';

const { get, omit, pick } = require( 'lodash' );
const { createCoreService } = require('@strapi/strapi').factories;

const config = require( '../config' );
const { UID_MENU } = require( '../constants' );
const { getService } = require( '../utils' );

module.exports = createCoreService( UID_MENU, ( { strapi } ) => ( {
  async checkAvailability( slug, id ) {
    const params = {
      filters: { slug },
    };

    // Optionally exclude by the ID so we don't check the menu against itself.
    if ( id ) {
      params.filters.id = { $ne: id };
    }

    const entity = await strapi.entityService.findMany( UID_MENU, params );

    return ! entity.length;
  },

  //////////////////////////////////////////////////////////////////////////////

  async create( params ) {
    const { data } = params;
    const menuData = pick( data, [ 'title', 'slug' ], {} );
    const menuItemsData = get( data, 'items', [] );

    // Create new menu.
    const entity = await super.create( { ...params, data: menuData } );
    let entityItems = [];

    // Maybe create menu items (should only happen when cloning).
    if ( menuItemsData.length ) {
      await getService( 'menu-item' ).bulkCreateOrUpdate( menuItemsData, entity.id );
    }

    // Because we create the menu before creating the items, we use `super.findOne`
    // here to ensure `params` are used consistently throughout the request.
    return await super.findOne( entity.id, omit( params, 'data' ) );
  },

  async update( id, params ) {
    const { data } = params;

    // Get the menu we are about to update so we can compare it to new data.
    const entityToUpdate = await getService( 'menu' ).findOne( id, {
      populate: [
        'items',
        'items.parent',
      ],
    } );

    const menuData = pick( data, [ 'title', 'slug' ], {} );
    const menuItemsData = get( data, 'items', [] );
    const prevItemsData = get( entityToUpdate, 'items', [] );

    // Compare new menu items to existing items to determine which can be deleted.
    const itemsToDelete = prevItemsData.filter( item => {
      return ! menuItemsData.find( _item => _item.id === item.id );
    } );

    // First, delete menu items that were removed from the menu.
    if ( itemsToDelete.length ) {
      await getService( 'menu-item' ).bulkDelete( itemsToDelete );
    }

    // Next, create or update menu items.
    if ( menuItemsData.length ) {
      await getService( 'menu-item' ).bulkCreateOrUpdate( menuItemsData, id );
    }

    /**
     * @TODO - Should menus and menu items only update if they've actually changed?
     * @TODO - How is `populate` being handled here?
     */

    // Finally, update the menu.
    return await super.update( id, {
      ...params,
      data: menuData,
      populate: [
        'items',
        'items.parent',
      ],
    } );
  },

  async delete( id ) {
    // First, delete menu items belonging to the menu that will be deleted.
    const itemsToDelete = await getService( 'menu-item' ).findByRootMenu( id );

    if ( itemsToDelete.length ) {
      await getService( 'menu-item' ).bulkDelete( itemsToDelete );
    }

    // Finally, delete the menu.
    return await super.delete( id );
  },
} ) );
