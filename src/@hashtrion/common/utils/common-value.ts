
export function getCurrentTime() {

    const options = { timeZone: 'Australia/Sydney', hour12: false };

    const now = new Date().toLocaleString('en-AU', options);

    return now;
}