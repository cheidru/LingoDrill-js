// ToDo:
// Generate list of files in DB

let dbError = false;
let OpenDB = null;
let db = null;
let id = 0;



function readFileDataFromDBtoScreen() {        
        // Try to open DB
        OpenDB = indexedDB.open("audioBase", 1);

        // openDB.onsuccess = makeListFromDB(openDB);
        OpenDB.onsuccess = (e) => {
                db = e.target.result;
                console.log("DB successfuly opened", db);
                // Check if the DB exists
                if (db.objectStoreNames.length > 0) {
                        // Double check by existing of the store
                        if (db.objectStoreNames.contains('audio')) {
                                console.log("Read from", db);
                                makeULfromDB(db);
                        } else {
                                console.log("Audio Store doesn't exist", db);
                        }
                } 
                
                //         // Delete the empty DB unless an audio file is selected
                //         if (db.objectStoreNames.length == 0) indexedDB.deleteDatabase("audioBase");
        }

        OpenDB.onerror = (err) => {
                console.warn(err); // Show error message
        }

        OpenDB.onupgradeneeded = (e) => {
                db = e.target.result;
                console.log("DB upgrade needed");
                
                if (!db.objectStoreNames.contains('audio')) {
                        // Create stores
                        console.log("Create Stores");
                        // let audioStore = db.createObjectStore('audio', {keyPath: 'id'}, {autoIncrement: 'true'});
                        let audioStore = db.createObjectStore('audio', {keyPath: 'id'});
                        let rangesStore = db.createObjectStore('ranges', {keyPath: 'id'}, {autoIncrement: 'true'});
                        let subtitlesStore = db.createObjectStore('subtitles', {keyPath: 'id'}, {autoIncrement: 'true'});
                        let languageStore = db.createObjectStore('language', {keyPath: 'id'}, {autoIncrement: 'true'});

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

function idx() {
        return id++;
}

function makeULfromDB(iDB) {
        // let dbRes = iDB.result;
        // let readFliesTransaction = dbRes.transaction('audio', 'readonly');
        // let audioIndex = readFliesTransaction.index("date");
        // let aList = audioIndex.getAll();






        // dbRes.oncomplete = (e) => {
        //         console.log(e);
        // }

        // dbRes.onerror = (err) => {
        //         console.warn(err);
        // }

        // // Read audio file names from DB object to li elements
        // for(let aObject of aList) {
        //         let newLi = document.createElement("li");
        //         newLi.textContent = aObject.aName;
        //         newLi.dataset.audioIndex = aObject.id;
        //         ul.append(newLi);
        // }
}

// Select an audio file from local file system
let addFileDialogue = document.querySelector("#add-file-dialogue");

addFileDialogue.addEventListener('change', function() {
        let file = this.files[0];
        console.log(file);
        // https://www.youtube.com/watch?v=y--Rjq6QV_o 9.37, 11.23, 13.05, 14.00

        let newAudioFile = {
                id: idx(),
                languageID: '',
                aFile: file,
                aName: file.name,
                aDuration: 0,
                fileName: file.name,
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
        readFileDataFromDBtoScreen;
        // ToDo:
        // Fetch file and metadata from input into blob
        // Create transaction
        // Get data into DB
        // Read db data to ul

})