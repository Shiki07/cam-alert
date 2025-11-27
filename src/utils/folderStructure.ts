/**
 * Generates a date-based folder path for recordings
 * Format: YYYY-MM-DD (e.g., 2025-01-27)
 */
export const getDateBasedFolder = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Generates a complete recording path with date organization
 */
export const getRecordingPath = (options: {
  basePath?: string;
  dateOrganized: boolean;
  motionDetected?: boolean;
  customSubfolder?: string;
}): string => {
  const { basePath = 'Videos', dateOrganized, motionDetected, customSubfolder } = options;
  
  let path = basePath;
  
  // Add date folder if enabled
  if (dateOrganized) {
    path = `${path}/${getDateBasedFolder()}`;
  }
  
  // Add motion/manual subfolder if no custom subfolder specified
  if (customSubfolder) {
    path = `${path}/${customSubfolder}`;
  } else if (!dateOrganized) {
    // Only add Motion/Manual when not using date organization
    const typeFolder = motionDetected ? 'Motion' : 'Manual';
    path = `${path}/${typeFolder}`;
  }
  
  return path;
};

/**
 * Gets a user-friendly description of the current folder structure
 */
export const getFolderDescription = (options: {
  dateOrganized: boolean;
  motionDetected?: boolean;
}): string => {
  const { dateOrganized, motionDetected } = options;
  
  if (dateOrganized) {
    const today = getDateBasedFolder();
    return `Videos/${today}/`;
  }
  
  const typeFolder = motionDetected ? 'Motion' : 'Manual';
  return `Videos/${typeFolder}/`;
};
