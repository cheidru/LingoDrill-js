let addFileDialogue = document.querySelector("#add-file-dialogue");
let fileOpen = addFileDialogue.addEventListener('change', function() {
        let file = this.files[0];
        console.log(file.name);




})


// Function to open or create DB and return it to callback function
function withDB (callback) {
        // Try to open DB
        let openDB = indexedDB.open("audioBase", 1);

        openDB.onsuccess = function(e) {
                let db = openDB.result;
                // Start callback function on the db
                callback(db);
        };

        openDB.onerror = console.error; // Show error message
        
        openDB.onupgradeneeded = function(e) {
                switch(e.oldVersion) {
                        case 0: // DB doesn't exist. Create DB structure
                                let audioStore = db.createObjectStore('audio', {keyPath: 'id'}, {autoIncrement: 'true'});
                                let rangesStore = db.createObjectStore('ranges', {keyPath: 'id'}, {autoIncrement: 'true'});
                                let subtitlesStore = db.createObjectStore('subtitles', {keyPath: 'id'}, {autoIncrement: 'true'});
                };
                rangesStore.createIndex("audioID", "prio");
                subtitlesStore.createIndex("audioID", "rangeID");

                // ToDo:
                // Fetch file and metadata from input into blob
                // Create transaction
                // Get data into DB
};
}

// ToDo:
// Generatye list of files in DB
// Handle opening of the selected file from the list