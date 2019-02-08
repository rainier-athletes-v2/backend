// retrieve students associated with mentor
export const myStudents = mentorId => (
  `SELECT 
    Name, 
    (SELECT 
      npe4__RelatedContact__r.Id,
      npe4__RelatedContact__r.FirstName,
      npe4__RelatedContact__r.LastName,
      npe4__RelatedContact__r.Student_Grade__c,
      npe4__RelatedContact__r.Gender__c,
      npe4__RelatedContact__r.Birthdate,
      npe4__RelatedContact__r.Student_ID__c,
      npe4__RelatedContact__r.npe01__PreferredPhone__c,
      npe4__RelatedContact__r.Phone,
      npe4__RelatedContact__r.HomePhone,
      npe4__RelatedContact__r.MobilePhone,
      npe4__RelatedContact__r.Email,
      npe4__Type__c, 
      npe4__Status__c
    FROM npe4__Relationships__r) 
  FROM Contact 
  WHERE Id = '${mentorId}'`
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
export const latestSynopsisReports = studentId => (
  `SELECT 
    Id, 
    Point_Sheet_Status__c,
    Start_Date__c 
  FROM SynopsisReport__c 
  WHERE Student__c = '${studentId}' 
  ORDER BY Start_Date__c DESC LIMIT 5`
);

// retrieve data for the synopsis report with id = <id>. Needs to have more fields addded to get complete SR/PT built.
export const thisSynopsisReport = reportId => (
  `SELECT 
    Id,
    Name,
    Point_Sheet_Status__c,
    Start_Date__c, 
    Family_Touch_Points__c, 
    (SELECT 
      Id, 
      Name, 
      Excused_Days__c, 
      Grade__c,
      Stamps__c, 
      Half_Stamps__c
    FROM PointTrackers__r) 
  FROM SynopsisReport__c 
  WHERE Id = '${reportId}`
);

// retrieve student's team affiliation
export const studentAffiliations = studentId => (
  `SELECT 
    Id, 
    Name, 
    npe5__Organization__r.npe01__One2OneContact__r.Name, 
    npe5__Organization__r.Name, 
    npe5__Organization__r.Type, 
    npe5__Contact__r.Name, 
    npe5__Role__c 
  FROM npe5__Affiliation__c 
  WHERE npe5__Contact__c = '${studentId}`
);
