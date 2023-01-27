// ToDo:
// Generate list of files in DB

let dbError = false;
let openDB = null;
let db = null;
let listOfAudio = document.querySelector("#file-list");

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
                                console.log("Read from", db);
                                makeULfromDB(db);
                                console.log("display changed to block");
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
                listOfAudio.innerHTML = request.result
                        .map((aRecordFromDB) => {
                                return `<li data-id="${aRecordFromDB.id}"><span>${aRecordFromDB.aName}</span></li>`
                }).join('\n'); // join <li>s with '\n' inbetween for better appearance in DevTool
        }
}

// Select an audio file from local file system
let addFileDialogue = document.querySelector("#add-file-dialogue");

addFileDialogue.addEventListener('change', function() {
        let file = this.files[0];
        console.log(file);
        // https://www.youtube.com/watch?v=y--Rjq6QV_o 9.37, 11.23, 13.05, 14.00

        let newAudioFile = {
                languageID: '',
                audioFile: file,
                aName: file.name,
                aDuration: 0,
                date: Date.now(),
                prio: 0
        }

        console.log(file);

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

        // add BLOB
        readFileDataFromDBtoScreen();
        // ToDo:
        // Fetch file and metadata from input into blob
        // Create transaction
        // Get data into DB
        // Read db data to ul

})

// Open a list item in player page
listOfAudio.addEventListener('click', (e) => {
        let itemID = e.target.dataset.id;
        localStorage.setItem('aFileID', itemID);
        window.open('player.html');
})
