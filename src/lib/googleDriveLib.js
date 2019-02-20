
import HttpError from 'http-errors';
import fs from 'fs';

import logger from './logger';

// common code used by extract-router and synopsys-router to send file to google drive

const createGoogleDriveFunction = (drive, TEMP_FILE, pdfName, schoolFolder, studentFolder, response, next) => async () => {
  const filePath = TEMP_FILE;

  const _getFolderId = async (folderName, parentFolderId = null) => {
    let driveListQuery = `name='${folderName}' and trashed = false`;
    driveListQuery += parentFolderId ? ` and '${parentFolderId}' in parents` : '';
    let res;
    try {
      res = await drive.files.list({ 
        mimeType: 'application/vnd.google-apps.folder',
        q: driveListQuery,
      }); 
    } catch (err) {
      logger.log(logger.ERROR, `${err.status}: Error retrieving drive file list.`); 
      return null; // next(new HttpError(err.status, 'Error retrieving drive file list. Likely bad OAuth.'));
    }
  
    // if we didn't catch an error above then oauth is good. Subsequent errors will be status 500
    let returnFolderId;
    if (res.data.files[0]) {
      // folder exists
      returnFolderId = res.data.files[0].id;     
    } else {  
      // create the folder
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        fields: 'id',
      };
      if (parentFolderId) {
        folderMetadata.parents = [parentFolderId];
      }

      let file;
      try {
        file = await drive.files.create({
          resource: folderMetadata,
        });
      } catch (error) {
        // Handle error
        logger.log(logger.ERROR, `Error creating creating folder ${error}`);
        return null;
      }
      returnFolderId = file.data.id; 
    }
    return returnFolderId;
  };

  const _unlink = async (fileName) => {
    await fs.unlink(fileName, (err) => {
      if (err) return logger.log(`fs.unlink error on ${fileName}: ${err}`);
      return undefined;
    });  
  };

  const _uploadFileToFolder = async (folderId) => {
    let readStream;
    try {
      readStream = await fs.createReadStream(filePath);
    } catch (err) {
      logger.log(logger.ERROR, `Error creating readStream ${err}`);
      return next(new HttpError(500, `Error creating readStream ${err}`));
    }

    // once folder is created, upload file to it 
    const resource = {
      name: `${pdfName}`,
      writersCanShare: true,
      parents: [folderId],
    };

    const media = {
      mimeType: 'application/pdf',
      body: readStream,
    };

    const params = {
      resource,
      media,
    };
    let result;
    try {
      result = await drive.files.create(params);
    } catch (cerr) {
      return next(new HttpError(500, `Unable to create file on google drive: ${cerr}`, { expose: false }));
    }
    // now set permissions so a shareable link will work
    try {
      await drive.permissions.create({
        resource: {
          type: 'anyone',
          role: 'reader',
        },
        fileId: result.data.id,
        fields: 'id',
      });
    } catch (err) {
      return next(new HttpError(500, `permissions.create error: ${err}`));
    }
    // if that worked get the file's metadata
    let metaData;
    try {
      metaData = await drive.files.get({ 
        fileId: result.data.id, 
        fields: 'webViewLink', 
      });
    } catch (gerr) {
      return next(new HttpError(500, `Unable to get file info from google drive: ${gerr}`));
    }
    // delete the temp file and return our http response
    await fs.unlink(TEMP_FILE, (derr) => {
      if (derr) return next(new HttpError(502, `File uploaded to google but unable to delete temp file: ${derr}`));

      // this is our success response:
      return response.json(metaData.data).status(200);
    });

    return undefined; // to satisfy linter
  }; // end _uploadFileToFolder

  // see if extract file exists. delete it if it does.
  let fileResult;
  try {
    fileResult = await drive.files.list({ 
      mimeType: 'application/vnd.google-apps.file',
      q: `name='${pdfName}' and trashed = false`,
    }); 
  } catch (err) {
    logger.log(logger.ERROR, `Error retrieving drive file list ${err}`);
    // delete temp file then return error response
    fs.unlink(TEMP_FILE, (derr) => {
      if (derr) return logger.log(`OAuth error as well as fs.unlink error: ${derr}`);
      return undefined;
    });      
    return next(new HttpError(401, 'Error retrieving drive file list. Likely bad OAuth.'));
  }
  
  if (fileResult.data.files[0]) {
    try {
      await drive.files.delete({ fileId: fileResult.data.files[0].id, supportsTeamDrives: false });
    } catch (err) {
      logger.log(logger.ERROR, 'error deleting pre-exisitng file:', err); // not going to have a fit over this particular error
    }
  }

  // see if school folder exists. if not, create it.
  const schoolFolderId = await _getFolderId(schoolFolder);
  if (!schoolFolderId) {
    await _unlink(TEMP_FILE);
    return next(new HttpError(500, 'Error retrieving school folder ID.'));
  }

  // see if student folder exists in school folder. if not, create it in school folder.
  const studentFolderId = await _getFolderId(studentFolder, schoolFolderId);
  if (!studentFolderId) {
    await _unlink(TEMP_FILE);
    return next(new HttpError(500, 'Error retrieving student folder ID.'));
  }

  return _uploadFileToFolder(studentFolderId);
}; // end of sendFileToGoogleDrive

export default createGoogleDriveFunction;
