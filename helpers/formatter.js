// Helper function to format date and time
function formatDateIso(date) {
    return date.toISOString().slice(0, 19).replace('T', ' '); // Format to 'YYYY-MM-DD HH:MM:SS'
}

function formatTimeUntis(time) {
    // Convert integer time (e.g., 845) to HH:MM format
    const hours = Math.floor(time / 100);
    const minutes = time % 100;
    return `${hours}:${minutes < 10 ? '0' : ''}${minutes}`; // Formats to HH:MM
}

// Function to format date from YYYYMMDD to a more readable format
function formatDateUntis(dateString) {
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return `${day}.${month}.${year}`; // Format as DD.MM.YYYY
}

export default {
    formatDateIso,
    formatTimeUntis,
    formatDateUntis
};