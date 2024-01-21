/**
 * The global API object exposed to the window - contains functions to create or manipulate custom context menus.
 * If you want to override the styles of the elements in your CSS, you can do so through setting the rules for
 * `.ctxMenu`, `.ctxMenuItem`, and `.ctxMenuDivider`
 */
var ctxMenus = (() => {
    
    /***********************************************/
    /*   Global state variables are defined here   */
    /***********************************************/

    let __debug = true;
    let activeMenus = [];
    let submenuTimer = null;

    /**********************************************/
    /*       End of global state variables        */
    /**********************************************/
    
    /* Let's make sure our context menus are closed when someone clicks outside of it. */
    window.addEventListener('mousedown', (e) => {

        let clickedContextMenu = null;
        let mouseX = e.clientX;
        let mouseY = e.clientY;

        for (let menu of activeMenus) {
            let bounds = menu.getBoundingClientRect();
            let [left, right, top, bottom] = [bounds.left, bounds.right, bounds.top, bounds.bottom];

            if (!(mouseX < left || mouseX > right || mouseY < top || mouseY > bottom)) {
                debug('We clicked inside the bounds of a context menu! Closing children ...');
                clickedContextMenu = menu;
                recursivelyCloseChildren(menu);
                return;
            }
        }

        /* We didn't click within the bounds of a single active context menu, so close all of them. */
        if (!clickedContextMenu) {
            debug('We clicked outside the bounds of any context menu! Closing them all ...');
            removeAll();
        }
    });

    /**
     * Debug logging function.
     * @param {string} str 
     */
    function debug(str) {
        if (__debug) {
            console.log("[*] Context Menu debug: " + str);
        }
    }
    
    function recursivelyCloseChildren(ctxMenu) {
        let activeSubmenu = ctxMenu.__ctxMenu.activeSubmenu
        if (activeSubmenu) {
            recursivelyCloseChildren(activeSubmenu);
            activeSubmenu.remove();
        }
    }

    /**
     * Creates a context menu HTML div element and returns it by reference.
     * @param {[{text: string, click: Function | Object, divider: boolean}]} menuObject The object literal that represents your context menu structure. See the docs for an example.
     * @param {{styles: { ctxMenu: Object, ctxMenuItem: Object, ctxMenuDivider: Object}}} options An object literal with keys that change the behavior or appearance of your context menu.
     * @param {HTMLDivElement | null} parent Don't pass anything in here unless you know what you're doing, just leave this blank :)
     * @returns {HTMLDivElement}
     */
    function createContextMenu(menuObject = [{ text: '', click: () => { } }], options = { styles: { ctxMenu: {}, ctxMenuItem: {}, ctxMenuDivider: {} }, position: {x: 0, y: 0} }, parent = null) {
        
        // Are we spawning the root context menu? If so, close all the other context menus.
        if (parent == null) {
            removeAll();
        }

        debug('Creating context menu...');

        let ctxMenu = document.createElement('div');

        /** 
         * Here is where our HTML element stores information for recursive submenu traversal for later on.
         * Remember - this object should **not** be written to or referenced under normal circumstances.
         */
        ctxMenu.__ctxMenu = {
            /** Each submenu can have only one child submenu rendered at once. */
            activeSubmenu: null,
            /** Each submenu must have a reference to the parent that spawned it. The root submenu element should -always- have this set as `null` */
            parentCtxMenuItem: parent,
            /** The raw menu object passed in by the user. */
            menuObject: menuObject
        }
        
        // setting a border just for debug/testing :) ignore this
        if (__debug) {
            ctxMenu.style.borderStyle = 'solid';
        }
        
        ctxMenu.style.position = 'absolute';

        ctxMenu.classList.add('ctxMenu');
        tryApplyUserStyles(ctxMenu, 'ctxMenu');

        createCtxMenuItems();

        let optPosition = options.position;
        
        if (optPosition) {
            let x = options.position.x;
            let y = options.position.y;

            if (x) {
                debug('Setting x position ...');
                ctxMenu.style.left = `${x}px`;
                debug(ctxMenu.style.left);
            }

            if (y) {
                debug('Setting y position ...');
                ctxMenu.style.top = `${y}px`;
                debug(ctxMenu.style.top);
            }
        }

        debug('Returning new context menu ...');

        activeMenus.push(ctxMenu);
        return ctxMenu;
        
        /**
         * Creates the submenu items and appends them to the current context menu being created.
         */
        function createCtxMenuItems() {

            /** 
            * `item` here is an object literal with the keys `text` and `click`, optionally also `enabled`
            *  where `click` should either be a function or a submenu object literal. 
            */
            for (let item of menuObject) {
                ctxMenu.appendChild(createCtxMenuItem(item));
            }
        }

        /**
         * Creates a single context menu item that is either a divider or a selectable menu item.
         * @param {{ text: 'N/A', click: Function | Array<Object>, enabled: boolean}} itemObj The context menu item object
         * @returns {HTMLDivElement}
         */
        function createCtxMenuItem(itemObj) {

            /* If it has a `divider` key, it must be a divider element. */
            if (itemObj.divider) {
                let divider = document.createElement('hr');
                
                divider.classList.add('ctxMenuDivider');
                tryApplyUserStyles(divider, 'divider');

                return divider;
            }

            /* ... else, it's a selectable menu item element. */

            let clickObject = itemObj.click;
            let text = itemObj.text;
            let enabled;

            // make sure that enabled is set to either true or false, even if it is not passed by the user.
            if (enabled == false) {
                enabled = false;
            } else {
                enabled = true;
            }
            
            let ctxMenuItem = document.createElement('div');
            ctxMenuItem.textContent = text;
            ctxMenuItem.style.userSelect = 'none';

            ctxMenuItem.__ctxMenuItem = {
                parentCtxMenu: ctxMenu,
                clickObject: itemObj.click || null,
                text: itemObj.text || null,
                enabled: itemObj.enabled || null,
                divider: itemObj.divider || null,
            }

            
            ctxMenuItem.addEventListener('mouseenter', onMouseEntered);
            ctxMenuItem.addEventListener('mouseleave', resetHoverTimer);
            ctxMenuItem.addEventListener('click', onClick);
            
            ctxMenuItem.classList.add('ctxMenuItem');
            tryApplyUserStyles(ctxMenuItem, 'ctxMenuItem');

            /**
             * Is executed when its respective context menu item element is hovered on for 600 ms.
             * @param {MouseEvent} e The MouseEvent fired by the context menu item.
             */
            function onMouseEntered(e) {
                if (submenuTimer) resetHoverTimer();

                submenuTimer = setTimeout( () => {
                    let bounds = ctxMenuItem.getBoundingClientRect();
                    let [mouseX, mouseY] = [e.clientX, e.clientY];
                    let [top, left, right, bottom] = [bounds.top, bounds.left, bounds.right, bounds.bottom];

                    if (!(mouseX < left || mouseX > right || mouseY < top || mouseY > bottom)) {
                        if (typeof(clickObject) === 'object') {
                            spawnSubmenu(clickObject, bounds.left + bounds.width, bounds.top);
                        } else {
                            if (submenuTimer) resetHoverTimer();
                        }
                    }
                }, 600);
            }

            /**
             * Is executed when its respective context menu item is clicked.
             * @param {MouseEvent} e The MouseEvent fired by the context menu item.
             */
            function onClick(e) {
                if (!enabled) { return; }

                /* this menu item does something when clicked */
                if (typeof (itemObj.click) === 'function') {
                    if (submenuTimer) resetHoverTimer();

                    // TODO: Allow the user to pass in their own parameters, and reference those here when calling the function.
                    removeAll();
                    itemObj.click();
                    return;
                }
                /* this menu item opens a submenu when hovered or clicked */
                if (typeof (itemObj.click === 'object')) {
                    resetHoverTimer();
                    spawnSubmenu();
                    return;
                }

                throw 'itemObj must either be of type `Function` or `Object`.';
            }

            /**
             * This function is triggered when a submenu is spawned either through clicking or hovering over a menu item for 600 ms. 
             * @return {HTMLDivElement}
             */
            function spawnSubmenu(menuObject, appendElement, x, y) {
                ctxMenu.__ctxMenu.activeSubmenu = createContextMenu(appendElement, x, y, menuObject, options, ctxMenu);
            }

            /**
             * Is executed when its respective context menu item is no longer hovered, or when the user blurs the window.
             */
            function resetHoverTimer() {
                clearTimeout(submenuTimer);
            }

            return ctxMenuItem;
        }

        function tryApplyUserStyles(el, targetClassName) {
            if (options) {
                if (options.styles) {
                    if (options.styles[targetClassName]) {
                        for (let [key, value] of Object.entries(options.styles)) {
                            el.style[key] = value;
                        }
                    }
                }
            }
        }


        /** ################################################################################################
         *  # This only serves to show you, the curious developer that is                                  #
         *  # currently reading this instead of the API docs, what a valid `menuObject` could look like.   #
         *  ################################################################################################ */

        let __exampleCtxMenu = (() => {
            const _exampleMenuObject = [{
                text: "Option 1",
                click: () => {
                    console.log('You clicked the first context menu option.');
                }
            },
            {
                text: "Option 2",
                click: () => {
                    console.log('You clicked the second context menu option.');
                },
                disabled: true
            },
            {
                text: "Option 3",
                click: [{
                    text: "Submenu Option 1",
                    click: () => {
                        console.log("You clicked the first submenu option!")
                    }
                }]
            }];
        });
    }

    /**
     * Removes all of the active context menus from the DOM.
     * @returns {void}
     */
    function removeAll() {
        for (let menu of activeMenus) {
            menu.remove();
        }
    }

    /* The public API that this module exposes. */
    return {
        create: createContextMenu,
        removeAll: removeAll
    }

}) ();