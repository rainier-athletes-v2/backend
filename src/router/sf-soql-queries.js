// retrieve students associated with mentor
export const myStudentsV1 = mentorId => (
  `SELECT 
    Name, 
    (SELECT 
      npe4__RelatedContact__r.Id,
      npe4__RelatedContact__r.FirstName,
      npe4__RelatedContact__r.LastName,
      npe4__RelatedCOntact__r.Name,
      npe4__RelatedContact__r.Student_Grade__c,
      npe4__RelatedContact__r.Gender__c,
      npe4__RelatedContact__r.Birthdate,
      npe4__RelatedContact__r.Student_ID__c,
      npe4__RelatedContact__r.npe01__PreferredPhone__c,
      npe4__RelatedContact__r.Phone,
      npe4__RelatedContact__r.HomePhone,
      npe4__RelatedContact__r.MobilePhone,
      npe4__RelatedContact__r.Email,
      npe4__RelatedContact__r.StudentGoogleCalendarUrl__c,
      npe4__RelatedContact__r.StudentGoogleDocsUrl__c,
      npe4__RelatedContact__r.StudentSynopsisReportArchiveUrl__c,
      npe4__Type__c, 
      npe4__Status__c
    FROM npe4__Relationships__r) 
  FROM Contact 
  WHERE Id = '${mentorId}'`
);

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
    Student__r.StudentGoogleDocsUrl__c,
    Student__r.StudentSynopsisReportArchiveUrl__c,
    Student__r.Synergy_Username__c,
    Student__r.Synergy_Password__c
  FROM SynopsisReport__c 
  WHERE SynopsisReport__c.Mentor__r.Id = '${mentorId}'`
);

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
    Point_Sheet_Status__c,
    Synopsis_Report_Status__c,
    Start_Date__c,
    Week__c
  FROM SynopsisReport__c 
  WHERE Student__c = '${studentId}' 
  ORDER BY Start_Date__c DESC LIMIT 3`
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
    Mentor_Is_Substitute__c,
    Weekly_Check_In_Status__c, 
    
    Student_Touch_Points__c,
    Student_Touch_Points_Other__c,
    Family_Touch_Points__c,
    Family_Touch_Points_Other__c,
    Teacher_Touch_Points__c,
    Teacher_Touch_Points_Other__c,
    Coach_Touch_Points__c,
    Coach_Touch_Points_Other__c,
    
    Wednesday_Check_In__c,
    Mentor_Meal__c,
    Sports_Game__c,
    Community_Event__c,
    IEP_Summer_Review_Meeting__c,
    Other_Meetup__c,
    One_Team_Notes__c,
    
    Point_Sheet_Status__c,
    Point_Sheet_Status_Notes__c,
    
    Earned_Playing_Time__c,
    Mentor_Granted_Playing_Time__c,
    
    Mentor_Granted_Playing_Time_Explanation__c,
    Student_Action_Items__c,
    Sports_Update__c,
    Additional_Comments__c,

    (SELECT 
      Id, 
      Name, 
      Excused_Days__c, 
      Grade__c,
      Stamps__c, 
      Half_Stamps__c,
      Class__r.Name,
      Class__r.Period__c,
      Class__r.Teacher__r.Name,
      Class__r.Teacher__r.LastName,
      Class__r.School__r.Name
    FROM PointTrackers__r) 
  FROM SynopsisReport__c 
  WHERE Id = '${reportId}'`
);

// retrieve student's team affiliation
export const studentAffiliations = studentId => (
  `SELECT 
    Id, 
    Name, 
    npe5__Organization__r.npe01__One2OneContact__r.Name,
    npe5__Organization__r.npe01__One2OneContact__r.Phone,
    npe5__Organization__r.npe01__One2OneContact__r.Email,
    npe5__Organization__r.Name, 
    npe5__Organization__r.Type, 
    npe5__Contact__r.Name,
    npe5__Contact__r.Id,
    npe5__Role__c,
    npe5__Status__c
  FROM npe5__Affiliation__c 
  WHERE npe5__Contact__c = '${studentId}'`
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
