// ToDo:
// Generate list of files in DB


let dbError = false;
let openDB = null;
let db = null;
let pageBody =  document.querySelector('body');
let pageBodyStyles = getComputedStyle(pageBody);
let fileDialog = document.querySelector("#add-file-dialog");
let listOfAudio = document.querySelector("#file-list");
let listOfStoredAudio = [];
let popUpWarning = document.querySelector('#file-exist-pop-up');
let popUpMenuAudioEdit = document.querySelector('#audio-edit-pop-up');
let popUpAudioRename = document.querySelector('#audio-rename-pop-up');
let popUpAudioDelete = document.querySelector('#audio-delete-pop-up');
let popUpSubtitleAddDelete = document.querySelector('#add-delete-subtitle-pop-up');

function readFileDataFromDBtoScreen() {        
        // Try to open DB
        openDB = indexedDB.open("audioBase", 1);

        openDB.onsuccess = (e) => {
                db = e.target.result;
                console.log("DB successfuly opened", db);
                // Check if the DB exists
                if (db.objectStoreNames.length > 0) {
                        // Double check by existing of the store
                        if (db.objectStoreNames.contains('audio')) {
                                console.log("Initial read from: ", db);
                                makeULfromDB(db);
                        } else {
                                console.log("Audio Store doesn't exist", db);
                        }
                }
        }

        openDB.onerror = (err) => {
                console.warn(err); // Show error message
        }

        openDB.onupgradeneeded = (e) => {
                db = e.target.result;
                console.log("DB upgrade needed");
                
                if (!db.objectStoreNames.contains('audio')) {
                        // Create stores
                        console.log("Create Stores");
                        // let audioStore = db.createObjectStore('audio', {keyPath: 'id'}, {autoIncrement: 'true'});
                        let audioStore = db.createObjectStore('audio', {keyPath: 'id', autoIncrement: 'true'});
                        let rangesStore = db.createObjectStore('ranges', {keyPath: 'id', autoIncrement: 'true'});
                        let subtitlesStore = db.createObjectStore('subtitles', {keyPath: 'id', autoIncrement: 'true'});
                        let languageStore = db.createObjectStore('language', {keyPath: 'id', autoIncrement: 'true'});

                        // Create additional indexes to stores
                        // // Index on file addition date to range the list of files
                        // audioStore.createIndex('dateIndex', 'date', {unique: false});
                        // // Index to link to audio ID in audioStore
                        // rangesStore.createIndex('audioIndex', 'audio', {unique: false});
                        // // Index to show a range priority
                        // rangesStore.createIndex('rangePrioIndex', 'prio', {unique: false});
                        // // Index to link subtitle fragment to range ID in rangeStore
                        // subtitlesStore.createIndex("rangeIndex", "rangeID", {unique: true});
                }
        }
}

readFileDataFromDBtoScreen();

function makeULfromDB(iDB) {
        let transAct = iDB.transaction('audio', 'readonly');
        let trasactionStore = transAct.objectStore('audio');
        let getReq = trasactionStore.getAll();

        // With the same result as handlind when request is successful,
        // it can be handled when transaction is complete under
        // trasactionStore.oncomplete = (evnt) => { ... etc.
        getReq.onsuccess = (evnt) => {
                let request = evnt.target // request === getReq
                console.log("request: ", request);
                listOfAudio.innerHTML = request.result.map((aRecordFromDB) => {
                                // fill the array of audio names in DB for duplicate prevention check
                                // typeof aRecordFromDB.id - number
                                listOfStoredAudio.push(aRecordFromDB.aName);
                                return `<li data-id="${aRecordFromDB.id}">
                                                <span>${aRecordFromDB.aName}</span>
                                                <svg class="edit-svg" width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path fill-rule="evenodd" clip-rule="evenodd" d="M17.6878 3.00154L20.9985 6.3122L12.3107 15H9V11.6893L17.6878 3.00154ZM17.6878 5.12286L10.5 12.3107V13.5H11.6893L18.8771 6.3122L17.6878 5.12286ZM5 5H12V6.5H6.5V17.5H17.5V12H19V19H5V5Z" fill="#1F2328"/>
                                                </svg>
                                        </li>`
                }).join('\n'); // join <li>s with '\n' inbetween for better appearance in DevTool
        }
}

function renameAudio(id, audioName) {

        let renameField = document.querySelector('#rename-field');
        // renameField.style.width = audioName.length + 'px';
        console.log('audioName.length :', audioName.length);
        renameField.textContent = audioName;
        popUpAudioRename.showModal();
        // default modal dialog doesn't freese the background (maybe a bug)
        // debugger
        pageBody.style.overflow = 'hidden';
        let btnCancel = document.querySelector('#cancel-rename-btn');
        btnCancel.onclick = (e) => {
                        e.stopPropagation();
                        popUpAudioRename.close();
                        pageBody.style.overflow = "visible";
        }

        // read NewName from input
        let btnSave = document.querySelector('#rename-btn');
        btnSave.onclick = (e) => {
                e.stopPropagation();
                popUpAudioRename.close();
                pageBody.style.overflow = "visible";


                // open store for read-write
                let transAct = db.transaction('audio', 'readwrite');
                let trasactionStore = transAct.objectStore('audio');
                // read the object with the given id
                console.log("id = ", id);
                let targetObjectRequest = trasactionStore.get(id);

                targetObjectRequest.onsuccess = (evnt) => {

                        let request = evnt.target;                        

                        // replace the object property aName
                        request.result.aName = renameField.textContent;
                        
                        // replace the object in DB with the altered one
                        const updateRequest = trasactionStore.put(targetObject, id);
                        // re-write list of audio on screen

                        updateRequest.onsuccess = (e) => console.log("Change complete");
                        updateRequest.onerror = (err) => console.warn("Change error");

                        readFileDataFromDBtoScreen();
                }
        }

        // update the list of audio
        // check and update localStorage if needed
}

function deleteRecordFromDB(id) {
        // find a record in DB
        // delete the record in DB
        // update the list of audio
        // check and update localStorage if needed
}

function addSubtitleFile(id) {
        // open FileDialoge to show txt and str files
        // read filename from input
        // find a record for the audio in DB
        // check DB if the subtitle file already exists and show
        // warning if needed
        // otherwise add subtitle file to DB
}

// Select an audio file from local file system
fileDialog.addEventListener('change', function() {

        let file = this.files[0];

        if (listOfStoredAudio.includes(file.name)) {
                popUpWarning.showModal();
                // delete HTMLInputElement FileList entirely to anable 'change' event of File Input
                // if the same file is clicked in FileDialog next time 
                // https://stackoverflow.com/questions/3144419/how-do-i-remove-a-file-from-the-filelist
                fileDialog.value = '';
                // default modal dialog doesn't freese the background (maybe a bug)
                pageBody.style.overflow = "hidden";
                pageBody.onclick = () => {
                        // if (popUpWarning.attributes.open) {
                                popUpWarning.close();
                                pageBody.style.overflow = "visible";
                        // }
                }

        } else {
                // https://www.youtube.com/watch?v=y--Rjq6QV_o 9.37, 11.23, 13.05, 14.00

                let newAudioFile = {
                        languageID: '',
                        audioFile: file,
                        aName: file.name,
                        aDuration: 0,
                        date: Date.now(),
                        prio: 0
                }

                // Add file data to DB
                let transAct = db.transaction('audio', 'readwrite');
                let trasactionStore = transAct.objectStore('audio');
                let request = trasactionStore.add(newAudioFile);

                transAct.oncomplete = (e) => console.log("Transaction complete");
                transAct.onerror = (err) => console.warn("Transaction error");

                request.onsuccess = (e) => console.log("Addition complete");
                request.onerror = (err) => console.warn("Addition error");


                        // Store object structure

                        // audio
                        // {
                        //      id,
                        //      languageID // optional
                        //      aFile // audio file itself                   
                        //      aName // by default the same as fileName
                        //      aDuration
                        //      fileName                  
                        //      date // date of addition
                        //      prio // optional, default 0                        
                        // }
                        
                        // ranges
                        // {
                        //      id,                       
                        //      audioID
                        //      startTime
                        //      endTime
                        //      loopNo // number of repetitions, 0 - infinite repetition                 
                        //      gap // pause between repetitions
                        //      prio // by default running number
                        //      subID-1
                        //      startSub-1
                        //      endSub-1
                        //      subID-2
                        //      startSub-2
                        //      endSub-2
                        //      subID-3
                        //      startSub-3
                        //      endSub-3
                        //      subID-4
                        //      startSub-4
                        //      endSub-4
                        //      subID-5
                        //      startSub-5
                        //      endSub-5
                        // }
                        
                        // subtitles
                        // {
                        //      id,
                        //      subFile // subtitle file itself
                        //      fileName  
                        //      languageID
                        //      date // date of addition
                        // }

                        // language
                        // {
                        //      id,
                        //      langNameEnglish
                        //      langNameOriginal
                        // }

                // Update info on screen and check-for-douplicate array with the new added file
                fileDialog.value = '';
                listOfStoredAudio = [];        
                readFileDataFromDBtoScreen();
        }
})

// Open the selected item on the player page or pop-up edit menu if edit icon clicked
listOfAudio.addEventListener('click', function AudioSelected (e) {
        e.stopPropagation();
        let listElementClicked = e.target.tagName;
        console.log("e.target.tagName = ", e.target.tagName);
        if (listElementClicked == 'svg' || listElementClicked == 'path') { 
                // Edit icon clicked    
                popUpMenuAudioEdit.showModal();
                let modalTitle = document.querySelector('#title');
                let selectedAudioName = '';
                let dbRecordID = '';


                // как перехватить событие на svg

                if (listElementClicked == 'path') {
                        selectedAudioName = e.target.parentNode.parentNode.firstElementChild.textContent.trim();
                        dbRecordID = e.target.parentNode.parentNode.dataset.id;
                } else {
                        selectedAudioName = e.target.parentNode.firstElementChild.textContent.trim();
                        dbRecordID = e.target.parentNode.dataset.id;
                }

                console.log("selectedAudioName = ", selectedAudioName);
                modalTitle.textContent = selectedAudioName;

                console.log("dbRecordID = ", dbRecordID, e.target.parentNode);
                // default modal dialog doesn't freese the background (maybe a bug)
                pageBody.style.overflow = "hidden";
                pageBody.onclick = () => {
                        // if (popUpMenuAudioEdit.attributes.open) {
                                popUpMenuAudioEdit.close();
                                pageBody.style.overflow = "visible";
                        // }
                }

                let renameMenu = document.querySelector('#audio-edit-rename');
                let deleteMenu = document.querySelector('#audio-editdelete');
                let subtitleMenu = document.querySelector('#audio-edit-subtitle');

                renameMenu.onclick = () => {renameAudio(dbRecordID, selectedAudioName)};

                // deleteMenu.onclick = deleteRecordFromDB(dbRecordID);
                // subtitleMenu.onclick = addSubtitleFile(dbRecordID);
        } else if (listElementClicked == 'SPAN') {
                // Audio name clicked, start player
                let li = e.target.closest('li');
                let itemID = li.dataset.id; // the same - li.getAttribute('data-id')
                localStorage.setItem('aFileID', itemID);
                window.open('player.html');
        }

})
