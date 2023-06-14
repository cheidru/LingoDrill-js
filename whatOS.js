let userAgent = window.navigator.userAgent;
// window.navigator.platform is deprecated and will be disabled in future navigator versions
// The alternative is navigator.userAgentData.platform, which is not 100% supported now
// Chome doesn't support it as yet
let userPlatform = window.navigator.platform;

let macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
let windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
let iosPlatforms = ['iPhone', 'iPad', 'iPod'];
let os = null;

if ((macosPlatforms.indexOf(platform) !== -1) || 
    (windowsPlatforms.indexOf(platform) !== -1) ||
    (!os && /Linux/.test(platform)))  {

        // pcStyle.css

    } else if (/Android/.test(userAgent) ||
                (iosPlatforms.indexOf(platform) !== -1)) {
        
        // mobileStyle.css

        // test

    };
