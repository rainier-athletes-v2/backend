// retrieve students associated with mentor
export const myStudents = mentorId => (
  `SELECT 
    Name, 
    Id,
    Student__r.Id,
    Student__r.FirstName,
    Student__r.LastName,
    Student__r.Name,
    Student__r.Student__c,
    Student__r.AccountId,
    Student__r.Student_Grade__c,
    Student__r.Gender__c,
    Student__r.Birthdate,
    Student__r.Student_ID__c,
    Student__r.npe01__PreferredPhone__c,
    Student__r.Phone,
    Student__r.HomePhone,
    Student__r.MobilePhone,
    Student__r.Email,
    Student__r.StudentGoogleCalendarUrl__c,
    Student__r.StudentSynopsisReportArchiveUrl__c,
    Student__r.Synergy_Username__c,
    Student__r.Synergy_Password__c,
    (SELECT 
      Class__r.School__r.Name
    FROM PointTrackers__r order by CreatedDate DESC LIMIT 1)
  FROM SynopsisReport__c 
  WHERE SynopsisReport__c.Start_Date__c >= N_DAYS_AGO:30 
    AND SynopsisReport__c.Mentor__r.Id = '${mentorId}'`
);

// removed this from between WHERE and the mentor__r.Id field above:
// SynopsisReport__c.Start_Date__c >= N_DAYS_AGO:14 AND 

export const classSchedule = studentId => (
  `SELECT 
    Name, 
    Id, 
    (SELECT 
      Class__c 
    FROM Class_Schedules__r) 
  FROM Contact 
  WHERE Id ='${studentId}`
);

// retrieve top 5 latest synopsis reports for initial mentor selection
export const recentSynopsisReports = studentId => (
  `SELECT 
    Id,
    Name,
    Synopsis_Report_Status__c,
    Start_Date__c,
    Week__c
  FROM SynopsisReport__c 
  WHERE Student__c = '${studentId}' 
  ORDER BY Start_Date__c DESC LIMIT 1`
);

// retrieve data for the synopsis report with id = <id>. Needs to have more fields addded to get complete SR/PT built.
export const thisSynopsisReport = reportId => (
  `SELECT
    Id,
    Name,
    Week__c,
    Start_Date__c,
    Synopsis_Report_Status__c,
    Student__r.Name,
    Student__r.Student_Grade__c,
    Student__r.Email,
    Mentor_Is_Substitute__c,
    Mentor__r.Name, 
    Mentor__r.Email,

    Identity_Statement_Status__c,
    Weekly_Check_In_Status__c,
    Weekly_Check_In_Missed_Reason__c,
    Check_in_status_met__c,
    Communication_Status_Met__c,
    Did_not_meet_communication__c,
    Communication_Method_No_Check_In__c,
    How_can_we_support_communication__c,
    How_can_we_support_comm_required__c,
    Communication_Method_No_Response__c,
    How_can_we_support__c,
    How_can_we_support_required__c,
    Family_Connection__c,
    Teacher_Connection__c,
    Coach_Connection__c,
    Identity_Statement_Weekly_Status__c,
    Identity_Statement_Prompts__c,
    Identity_Statement_Why_Not__c,
    Identity_Statement_Highlights__c,

    Point_Sheet_Status__c,
    Point_Sheet_MS_Self_Reflection__c,
    Point_Sheet_ES_Self_Reflection__c,
    Point_Sheet_Teacher_Convo_MS__c,
    Point_Sheet_Teacher_Convo_ES__c,
    No_Point_Sheet__c,
    No_Point_Sheet_What_Happened__c,
    Point_Sheet_and_School_Update__c,
    
    Sports_Update__c,
    Additional_Comments__c,

    Mentor_Support_Request__c,
    Mentor_Support_Request_Notes__c

  FROM SynopsisReport__c 
  WHERE Id = '${reportId}'`
);

// retrieve student's team affiliation
export const studentTeamAffiliations = studentId => (
  `SELECT 
    Id, 
    Name, 
    npe5__Organization__r.npe01__One2OneContact__r.Name,
    npe5__Organization__r.npe01__One2OneContact__r.Phone,
    npe5__Organization__r.npe01__One2OneContact__r.Email,
    npe5__Organization__r.Name, 
    npe5__Organization__r.Type,
    npe5__Organization__r.Parent.Name,
    npe5__Contact__r.Name,
    npe5__Contact__r.Id,
    npe5__Role__c,
    npe5__Status__c
  FROM npe5__Affiliation__c 
  WHERE npe5__Organization__r.Type = 'Sports Team'
    AND (npe5__EndDate__c > TODAY OR npe5__EndDate__c = TODAY)
    AND npe5__Status__c = 'Current'
    AND npe5__Contact__c = '${studentId}'`
);

export const accountName = accountId => (
  `SELECT
    Name
  FROM Account
  WHERE Id = '${accountId}`
);

export const studentFamilyMembers = accountId => (
  `SELECT
    Id, 
    Name, 
    (SELECT 
      Id, 
      Name, 
      Email,  
      Phone 
    FROM Contacts 
    WHERE Student_Family__c = TRUE)
  FROM Account
  Where Id = '${accountId}'`
);

export const relatedTeacher = studentId => (
  `SELECT
    npe4__Contact__c,
    npe4__RelatedContact__r.Name,  
    npe4__Status__c 
  FROM npe4__Relationship__c 
  WHERE npe4__Type__c = 'Teacher' AND npe4__Contact__c = '${studentId}'`
);
