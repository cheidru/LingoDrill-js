let userAgent = window.navigator.userAgent;
// window.navigator.platform is deprecated and will be disabled in future navigator versions
// The alternative is navigator.userAgentData.platform, which is not 100% supported now
// Chome doesn't support it as yet
let userPlatform = window.navigator.platform;

let macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
let windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
let iosPlatforms = ['iPhone', 'iPad', 'iPod'];
let os = null;
let osName = '';

if ((macosPlatforms.indexOf(userPlatform) !== -1) || 
    (windowsPlatforms.indexOf(userPlatform) !== -1) ||
    (/Linux/.test(userPlatform))
     )  {
        osName = "PC";
        // pcStyle.css

    } else if (/Android/.test(userAgent) ||
                (iosPlatforms.indexOf(userPlatform) !== -1)) {
        osName = "mobile";
        // mobileStyle.css
    } else {
        osName = "unknown OS";
    };

let showOS = document.querySelector('#app-name');
showOS.textContent = userPlatform;
// showOS.textContent = osName;
