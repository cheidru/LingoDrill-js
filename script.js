// ToDo:
// Generate list of files in DB

let dbExist = true;

function listFilesFromDB() {        
        // Try to open DB
        let openDB = indexedDB.open("audioBase", 1);

        openDB.onsuccess = function() {
                let db = openDB.result;
                let readFliesTransaction = db.transaction('audio', 'readonly');
                let audioIndex = readFliesTransaction.index("date");
                let aList = audioIndex.getAll();

                // Read audio file names from DB object to li elements
                for(let aObject of aList) {
                        let newLi = document.createElement("li");
                        newLi.textContent = aObject.aName;
                        newLi.dataset.audioIndex = aObject.id;
                        ul.append(newLi);
                }
        };

        openDB.onerror = console.error; // Show error message        
        openDB.onupgradeneeded = () => dbExist = false;
}


// Function to open or create DB and return it to callback function
function withDB (callback) {
        openDB.onupgradeneeded = function(e) {
                switch(e.oldVersion) {
                        case 0: // DB doesn't exist. Create DB structure
                                let audioStore = db.createObjectStore('audio', {keyPath: 'id'}, {autoIncrement: 'true'});
                                let rangesStore = db.createObjectStore('ranges', {keyPath: 'id'}, {autoIncrement: 'true'});
                                let subtitlesStore = db.createObjectStore('subtitles', {keyPath: 'id'}, {autoIncrement: 'true'});
                };
                // Create additional indexes to stores

                // Index on file addition date to range the list of files
                audioStore.createIndex('dateIndex', 'date', {unique: false});
                // Index to link to audio ID in audioStore
                rangesStore.createIndex('audioIndex', 'audio', {unique: false});
                // Index to show a range priority
                rangesStore.createIndex('rangePrioIndex', 'prio', {unique: false});
                // Index to link subtitle fragment to range ID in rangeStore
                subtitlesStore.createIndex("rangeIndex", "rangeID", {unique: true});
        };
    
        // ToDo:
        // Fetch file and metadata from input into blob
        // Create transaction
        // Get data into DB
}


// Select an audio file from local file system
let addFileDialogue = document.querySelector("#add-file-dialogue");
let fileOpen = addFileDialogue.addEventListener('change', function() {
        let file = this.files[0];
        console.log(file.name);
})

// ToDo:
// Handle opening of the selected file from the list