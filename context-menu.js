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
    let rootMenu = null;

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
     * @param {{}} options An object literal with keys that change the behavior or appearance of your context menu.
     * @param {HTMLDivElement | null} parent Don't pass anything in here unless you know what you're doing, just leave this blank :)
     * @returns {HTMLDivElement}
     */
    function createContextMenu(menuObject = [{ text: '', click: () => { } }], options = { styles: { ctxMenu: {}, ctxMenuItem: {}, ctxMenuDivider: {} }, position: { x: 0, y: 0 } }, parent = null) {

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

        if (parent == null) {
            removeAll();
            rootMenu = ctxMenu;
        }

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
                console.log(item);
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

                debug('Returning DIVIDER (<hr>) menu item ...');
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

                submenuTimer = setTimeout(() => {
                    let bounds = ctxMenuItem.getBoundingClientRect();
                    let [mouseX, mouseY] = [e.clientX, e.clientY];
                    let [top, left, right, bottom] = [bounds.top, bounds.left, bounds.right, bounds.bottom];

                    if (!(mouseX < left || mouseX > right || mouseY < top || mouseY > bottom)) {
                        if (typeof (clickObject) === 'object') {
                            debug('Creating submenu ...');
                            render(clickObject, ctxMenuItem, bounds.left + bounds.width, bounds.top);
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
                    let bounds = ctxMenuItem.getBoundingClientRect();
                    let [mouseX, mouseY] = [e.clientX, e.clientY];
                    let [top, left, right, bottom] = [bounds.top, bounds.left, bounds.right, bounds.bottom];

                    resetHoverTimer();
                    spawnSubmenu(clickObject, ctxMenuItem, bounds.left + bounds.width, bounds.top);
                    return;
                }

                throw 'itemObj must either be of type `Function` or `Object`.';
            }

            /**
             * This function is triggered when a submenu is spawned either through clicking or hovering over a menu item for 600 ms. 
             * @return {HTMLDivElement}
             */
            function spawnSubmenu(menuObject, appendElement, x, y) {
                let newSubmenu = createContextMenu(menuObject, x, y, menuObject, options, ctxMenu);
                ctxMenu.__ctxMenu.activeSubmenu = newSubmenu;
                appendElement.appendChild(newSubmenu);
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
    }

    /**
     * Removes all of the active context menus from the DOM.
     * @returns {void}
     */
    function removeAll() {
        for (let menu of activeMenus) {
            menu.remove();
        }

        rootMenu = null;
    }

    function calculateOverflow(rect, viewportRect) {
        const overflow = {
            top: Math.max(viewportRect.top - rect.top, 0),
            right: Math.max(rect.right - viewportRect.right, 0),
            bottom: Math.max(rect.bottom - viewportRect.bottom, 0),
            left: Math.max(viewportRect.left - rect.left, 0)
        };

        return overflow;
    }

    /**
     * Append the context menu div to the body, rendering the menu based on where available space exists relative to the viewport.
     * @param {HTMLDivElement} contextMenuElement A context menu created with `ctxMenus.create()`
     * @param {number} x The x coordinate at which to spawn the menu
     * @param {number} y The y coordinate at which to spawn the menu
     * @param {HTMLDivElement} parentMenuItemDiv The parent context menu item that spawns this menu - if any. Leave this alone if you don't know what you are doing.
     */
    function render(contextMenuElement, x, y, parentMenuItemDiv = null) {
        
        /* Render a fake, invisible dummy menu that we can sample the would-be rendered dimensions from. */
        let dummyMenu = contextMenuElement.cloneNode(true);

        dummyMenu.style.visibility = 'hidden';
        dummyMenu.style.top = `${y}px`;
        dummyMenu.style.left = `${x}px`;

        document.body.appendChild(dummyMenu);

        /* Let's calculate what direction would have the most overflow if we positioned the context menu there. */

        if (parentMenuItemDiv) {
            let itemDivBounds = parentMenuItemDiv.getBoundingClientRect();
            let posTopLeft = { x: itemDivBounds.left, y: itemDivBounds.top };
            let posBtmLeft = { x: itemDivBounds.left, y: itemDivBounds.bottom };
            let posTopRight = { x: itemDivBounds.right, y: itemDivBounds.top };
            let posBtmRight = { x: itemDivBounds.right, y: itemDivBounds.bottom };
        } else {

        }

        let bounds = dummyMenu.getBoundingClientRect();
        let viewportBounds = { top: 0, right: window.innerWidth, left: 0, bottom: window.innerHeight };
        let overflow = calculateOverflow(bounds, viewportBounds);
        
        let calculatedLeft = bounds.left;
        let calculatedTop = bounds.top;

        /* Kill the dummy menu now that we have its post-css dimensions. */
        dummyMenu.remove();

        /* Choose the direction with the smallest overflowing rect */
        if (overflow.top < overflow.bottom && overflow.top < overflow.left && overflow.top < overflow.right) {
            calculatedTop = bounds.top - overflow.top - bounds.height;

        } else if (overflow.right < overflow.bottom && overflow.right < overflow.left) {
            calculatedLeft = bounds.left - overflow.right - bounds.width;

        } else if (overflow.bottom < overflow.left) {
            calculatedTop = bounds.top + overflow.bottom;

        } else {
            calculatedLeft = bounds.left + overflow.left;

        }

        /* Now, let's set the position of the real menu. */
        let realMenu = contextMenuElement;
        realMenu.style.top = calculatedTop;
        realMenu.style.left = calculatedLeft;

        /* Finally, append the real menu element to the body with the correct position. */
        document.body.appendChild(realMenu);
        
    }

    /* The public API that this module exposes. */
    return {
        create: createContextMenu,
        removeAll: removeAll,
        render: render
    }

})();