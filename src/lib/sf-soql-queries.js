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
    Student__r.Rainier_Athletes_Email__c,
    Student__r.StudentGoogleCalendarUrl__c,
    Student__r.StudentSynopsisReportArchiveUrl__c,
    Student__r.Synergy_Username__c,
    Student__r.Synergy_Password__c,
    (SELECT 
      Class__r.School__r.Name
    FROM PointTrackers__r order by CreatedDate DESC LIMIT 1)
  FROM SynopsisReport__c 
  WHERE SynopsisReport__c.Start_Date__c >= N_DAYS_AGO:10 
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
    Student__r.Rainier_Athletes_Email__c,
    Mentor_Is_Substitute__c,
    Mentor__r.Name, 
    Mentor__r.Rainier_Athletes_Email__c,

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
    Identity_Statement_Topic__c,
    Identity_Statement_Why_Not__c,
    Identity_Statement_Highlights__c,
    Identity_Statement_Notes__c,
    Identity_Journal_Status__c,
    Identity_Journal_MS_Self_Reflection__c,
    Identity_Journal_ES_Self_Reflection__c,
    Identity_Journal_Teacher_Convo_MS__c,
    Identity_Journal_Teacher_Convo_ES__c,
    No_Identity_Journal__c,
    Identity_Journal_and_Teacher_Convo__c,
    No_Identity_Journal_What_Happened__c,

    Summer_attend_next_camp__c,
    Summer_attended_last_camp__c,
    Summer_attended_last_camp_notes__c,
    Summer_family_connection_made__c,
    Summer_family_conn_phone__c,
    Summer_family_conn_camp__c,
    Summer_family_conn_meal__c,
    Summer_family_conn_ymca__c,
    Summer_family_conn_digital__c,
    Summer_family_conn_other__c,
    Summer_family_connection_other_notes__c,
    Summer_next_camp_notes__c,
    Summer_question_of_the_week_answered__c,
    Summer_weekly_connection_made__c,
    Summer_conn_met__c,
    Summer_conn_called__c,
    Summer_conn_late_call__c,
    Summer_conn_basecamp__c,
    Summer_conn_no_answer__c,
    Summer_conn_no_show__c,
    Summer_conn_missed_other__c,
    Summer_weekly_connection_other_notes__c,
    Summer_additional_team_comments__c,
    Whats_been_happening__c,

    Weekly_Sports_and_Activities_Update__c,
    Sports_and_Activities_Update__c,
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
