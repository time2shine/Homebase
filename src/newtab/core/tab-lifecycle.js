async function handleSingletonMode() {

  // Safety check: ensure APIs exist

  if (!browser.tabs || !browser.tabs.getCurrent || !browser.tabs.update) return;



  try {

    const currentTab = await browser.tabs.getCurrent();

    if (!currentTab) return;



    // Filter by URL AND Container (cookieStoreId)

    const tabs = await browser.tabs.query({

      url: window.location.href,

      cookieStoreId: currentTab.cookieStoreId

    });



    // Find a tab that isn't THIS one

    const existingTab = tabs.find((t) => t.id !== currentTab.id);



    if (existingTab) {

      // Switch to the old tab

      await browser.tabs.update(existingTab.id, { active: true });

      // Close this new duplicate

      window.close();

    }

  } catch (err) {

    console.warn('Singleton mode check failed', err);

  }

}



async function manageHomebaseTabs() {

  if (appMaxTabsPreference === 0 && appAutoClosePreference === 0) return;

  if (!browser.tabs || !browser.tabs.query || !browser.tabs.remove || !browser.tabs.getCurrent) return;



  try {

    const currentTab = await browser.tabs.getCurrent();

    if (!currentTab) return;

    const allTabs = await browser.tabs.query({ url: window.location.href });



    const myTabs = allTabs.filter((t) => t.cookieStoreId === currentTab.cookieStoreId);



    myTabs.sort((a, b) => b.lastAccessed - a.lastAccessed);



    const tabsToClose = new Set();

    const now = Date.now();



    if (appAutoClosePreference > 0) {

      const thresholdMs = appAutoClosePreference * 60 * 1000;



      myTabs.forEach((tab) => {

        if (tab.active || tab.pinned || tab.audible) return;



        const timeSinceAccess = now - tab.lastAccessed;

        if (timeSinceAccess > thresholdMs) {

          tabsToClose.add(tab.id);

        }

      });

    }



    if (appMaxTabsPreference > 0) {

      const survivors = myTabs.filter((t) => !tabsToClose.has(t.id));



      if (survivors.length > appMaxTabsPreference) {

        const extras = survivors.slice(appMaxTabsPreference);



        extras.forEach((tab) => {

          if (!tab.active && !tab.pinned && !tab.audible) {

            tabsToClose.add(tab.id);

          }

        });

      }

    }



    if (tabsToClose.size > 0) {

      await browser.tabs.remove(Array.from(tabsToClose));

      hbDebugInfo(`Cleaned up ${tabsToClose.size} extra Homebase tabs.`);

    }

  } catch (err) {

    console.warn('Failed to manage Homebase tabs', err);

  }

}
