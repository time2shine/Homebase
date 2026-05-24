async function setupContainerMode() {

  const row = document.getElementById('app-container-mode-row');

  const toggle = document.getElementById('app-container-mode-toggle');

  const subSettings = document.getElementById('container-sub-settings');

  const behaviorRow = document.getElementById('app-container-behavior-row');

  const radioKeep = document.querySelector('input[name="container-behavior"][value="keep"]');

  const radioClose = document.querySelector('input[name="container-behavior"][value="close"]');



  // 1. Feature Detection: Only run if browser supports identities

  if (!browser.contextualIdentities) {

    if (row) row.style.display = 'none';

    if (subSettings) subSettings.style.display = 'none';

    if (behaviorRow) behaviorRow.style.display = 'none';

    return;

  }



  // 2. Show the setting row

  if (row) row.style.display = 'flex';

  if (subSettings) {

    subSettings.style.display = '';

    setSubSettingsExpanded(subSettings, appContainerModePreference);

  }

  if (behaviorRow) {

    behaviorRow.style.display = appContainerModePreference ? 'flex' : 'none';

  }



  // 3. Sync Toggle State

  if (toggle) {

    toggle.checked = appContainerModePreference;



    toggle.addEventListener('change', async (e) => {

      const isEnabled = e.target.checked;



      appContainerModePreference = isEnabled;

      if (subSettings) setSubSettingsExpanded(subSettings, isEnabled, { scrollIntoView: true });
      if (behaviorRow) behaviorRow.style.display = isEnabled ? 'flex' : 'none';

      await browser.storage.local.set({ [APP_CONTAINER_MODE_KEY]: isEnabled });

    });

  }



  if (radioKeep && radioClose) {

    if (appContainerNewTabPreference) {

      radioKeep.checked = true;

    } else {

      radioClose.checked = true;

    }



    const handleRadioChange = async (e) => {

      if (e.target.checked) {

        appContainerNewTabPreference = (e.target.value === 'keep');

        await browser.storage.local.set({ [APP_CONTAINER_NEW_TAB_KEY]: appContainerNewTabPreference });

      }

    };



    radioKeep.addEventListener('change', handleRadioChange);

    radioClose.addEventListener('change', handleRadioChange);

  }

}



async function ensureCookiesPermissionForContainers() {
  if (!browser || !browser.permissions || !browser.permissions.contains || !browser.permissions.request) {
    return false;
  }

  try {
    const has = await browser.permissions.contains({ permissions: ['cookies'] });
    if (has) return true;

    const request = await browser.permissions.request({ permissions: ['cookies'] });
    return request === true;
  } catch (e) {
    return false;
  }
}

async function handleContainerPermissionDenied(urlOrUrls) {
  console.warn('Cookies permission denied or unavailable; opening without container.');
  if (!urlOrUrls) return;
  const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  for (const url of urls) {
    if (!url) continue;
    try {
      await browser.tabs.create({ url, active: true });
    } catch (e) {
      // Best-effort fallback only.
    }
  }
}

// Updated to accept targetId explicitly

async function populateContainerMenu(targetId, isFolder = false) {

  // 1. Determine which menu we are populating based on what was clicked

  const groupID = isFolder ? 'folder-context-container-group' : 'context-menu-container-group';

  const listID = isFolder ? 'folder-context-container-list' : 'context-menu-container-list';

  const parentMenuID = isFolder ? 'bookmark-grid-folder-menu' : 'bookmark-icon-menu';



  const containerGroup = document.getElementById(groupID);

  const containerList = document.getElementById(listID);



  // 2. Safety Checks

  if (!containerGroup || !containerList || !appContainerModePreference || !browser.contextualIdentities) {

    if (containerGroup) containerGroup.classList.add('hidden');

    return;

  }



  try {

    // 3. Fetch Containers

    const containers = await browser.contextualIdentities.query({});

    

    if (!containers || containers.length === 0) {

      containerGroup.classList.add('hidden');

      return;

    }



    containerList.innerHTML = '';

    

    // 4. Create Buttons

    containers.forEach((identity) => {

      const btn = document.createElement('button');

      btn.className = 'container-item';

      

      const icon = document.createElement('span');

      icon.className = 'container-icon';

      const colorMap = {

        blue: '#37adff',

        turquoise: '#00c79a',

        green: '#51cd00',

        yellow: '#ffcb00',

        orange: '#ff9f00',

        red: '#ff613d',

        pink: '#ff4bda',

        purple: '#af51f5'

      };

      icon.style.backgroundColor = colorMap[identity.color] || identity.colorCode || identity.color || '#333';



      btn.appendChild(icon);

      

      const text = document.createElement('span');

      text.textContent = identity.name;

      btn.appendChild(text);



      // 5. Handle Click

      btn.onclick = (e) => {

        e.stopPropagation();

        

        if (isFolder) {

          openFolderInContainer(targetId, identity.cookieStoreId);

        } else {

          openBookmarkInContainer(targetId, identity.cookieStoreId);

        }

        

        // Close the parent menu

        const menu = document.getElementById(parentMenuID);

        if (menu) menu.classList.add('hidden');

      };



      containerList.appendChild(btn);

    });



    containerGroup.classList.remove('hidden');



  } catch (err) {

    console.warn('Failed to load containers', err);

    containerGroup.classList.add('hidden');

  }

}



async function openFolderInContainer(folderId, cookieStoreId) {

  if (!folderId) return;

  

  const folderNode = findBookmarkNodeById(bookmarkTree[0], folderId);

  

  if (!folderNode || !folderNode.children || folderNode.children.length === 0) {

    alert('This folder is empty.');

    return;

  }



  if (folderNode.children.length > 10) {

    const confirmed = confirm(`Are you sure you want to open ${folderNode.children.length} tabs in this container?`);

    if (!confirmed) return;

  }



  if (!cookieStoreId) {
    for (const child of folderNode.children) {
      if (child.url) {
        await browser.tabs.create({
          url: child.url,
          active: false
        });
      }
    }
    return;
  }

  const hasPermission = await ensureCookiesPermissionForContainers();
  if (!hasPermission) {
    const urls = [];
    for (const child of folderNode.children) {
      if (child.url) {
        urls.push(child.url);
      }
    }
    if (urls.length) {
      await handleContainerPermissionDenied(urls);
    }
    return;
  }

  for (const child of folderNode.children) {

    if (child.url) {

      await browser.tabs.create({

        url: child.url,

        cookieStoreId: cookieStoreId,

        active: false

      });

    }

  }

}



async function openBookmarkInContainer(bookmarkId, cookieStoreId) {

  if (!bookmarkId) return;

  

  // Ensure we have the latest tree before searching

  if (!bookmarkTree || !bookmarkTree[0]) {

    await getBookmarkTree();

  }



  const node = findBookmarkNodeById(bookmarkTree[0], bookmarkId);

  if (!node || !node.url) {

    console.error('Bookmark node not found or has no URL:', bookmarkId);

    alert('Invalid bookmark URL.');

    return;

  }



  try {

    let currentTab = null;

    try {

      currentTab = await browser.tabs.getCurrent();

    } catch (e) {

      console.warn('Could not determine current tab', e);

    }

    const openWithoutContainer = async () => {
      if (appContainerNewTabPreference) {
        await browser.tabs.create({
          url: node.url,
          active: false
        });
      } else {
        const createProps = {
          url: node.url,
          active: true
        };

        if (currentTab && currentTab.id) {
          createProps.index = currentTab.index + 1;
          await browser.tabs.create(createProps);
          await browser.tabs.remove(currentTab.id);
        } else {
          await browser.tabs.create(createProps);
        }
      }
    };

    if (!cookieStoreId) {
      await openWithoutContainer();
      return;
    }

    const hasPermission = await ensureCookiesPermissionForContainers();
    if (!hasPermission) {
      await handleContainerPermissionDenied(node.url);
      return;
    }

    if (appContainerNewTabPreference) {

      await browser.tabs.create({

        url: node.url,

        cookieStoreId: cookieStoreId,

        active: false

      });

    } else {

      const createProps = {

        url: node.url,

        cookieStoreId: cookieStoreId,

        active: true

      };



      if (currentTab && currentTab.id) {

        createProps.index = currentTab.index + 1;

        await browser.tabs.create(createProps);

        await browser.tabs.remove(currentTab.id);

      } else {

        await browser.tabs.create(createProps);

      }

    }

  } catch (err) {

    console.error('Failed to open in container', err);

    alert('Error opening container tab. Check console for details.');

  }

}
