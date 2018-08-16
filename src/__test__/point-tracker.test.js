import superagent from 'superagent';
import bearerAuth from 'superagent-auth-bearer';
import { createPointTrackerMockPromise, removeAllResources } from './lib/point-tracker-mock';
import Profile from '../model/profile';
import { startServer } from '../lib/server';

bearerAuth(superagent);

const apiUrl = `http://localhost:${process.env.PORT}/api/v1`;
beforeAll(async () => { await startServer(); });
let mockdata;


// beforeEach(async () => {
//   await removeAllResources();
//   mockdata = await createPointTrackerMockPromise();
// });

// describe('Testing point tracker post routes', () => {
//   test.only('Testing a posted point tracker', async () => {
//     const newPT = JSON.parse(JSON.stringify(mockdata.pointTracker));
//     delete newPT._id;
//     let response;
//     try {
//       response = await superagent.post(`${apiUrl}/pointstracker`)
//         .authBearer(mockdata.mockProfiles.mentorToken)
//         .send(newPT);
//Tracy and Chris changes

describe('TESTING POINT-TRACKER MODEL', () => {
  let mockData;
  let token;
  beforeEach(async () => {
    await startServer();
    await removeAllResources();
    try {
      mockData = await createPointTrackerMockPromise();
      token = mockData.token; /*eslint-disable-line*/

    } catch (err) {
      expect(err).toEqual('unexpected error on point tracker post');
    } 
    expect(response.status).toEqual(200);
    const updatedStudent = await Profile.findById(mockdata.pointTracker.studentId);
    expect(updatedStudent.studentData.lastPointTracker.toString()).toEqual(response.body._id);
  });
 
  describe('Adding points to point tracker, POST test', () => {
    test('Testing a posted point tracker to wrong route', async () => {
      try {
        const response = await superagent.get(`${apiUrl}/fakeroute`);
        expect(response.status).toEqual('404 Bad Route should be returned');
      } catch (err) {
        expect(err.status).toEqual(404);
      }
    });


  //   test('/api/v1/pointstracker 200 POST SUCCESS', async () => {
  //     // const mockPointTracker = await createPointTrackerMockPromise();
  //     try {
  //       // console.log(mockPointTracker.pointTracker);
  //       const pointTracker = JSON.parse(JSON.stringify(mockData.pointTracker));
  //       delete pointTracker._id;
  //       const response = await superagent.post(`${apiUrl}/pointstracker`)
  //         .authBearer(token)
  //         .send(pointTracker);
  //       expect(response.status).toEqual(200);
  //       expect(response.body.studentId.toString()).toEqual(pointTracker.studentId);
  //     } catch (err) {
  //       expect(err.message).toEqual('Unexpected error while testing point tracker POST');
  //     }
  //   });

    test.only('/api/v1/pointstracker 200 POST SUCCESS', async () => {
      // const mockPointTracker = await createPointTrackerMockPromise();
      try {
        // console.log(mockPointTracker.pointTracker);
        const pointTracker = JSON.parse(JSON.stringify(mockData.pointTracker));
        // console.log(pointTracker);
        delete pointTracker._id;
        const response = await superagent.post(`${apiUrl}/pointstracker`)
          .authBearer(token)
          .send(pointTracker);
        expect(response.status).toEqual(200);
        console.log('###################', response.body);
        console.log('@@@@@@@@@@@@@@@', pointTracker);

        expect(response.body.student.toString()).toEqual(pointTracker.student.toString());
      } catch (err) {
        expect(err.message).toEqual('Unexpected error while testing point tracker POST');
      }
    });


  //   test('api/v1/pointstracker 409 DUPLICATE POST', async () => {
  //     // const firstPointTracker = mockData.pointTracker;
  //     const duplicatePointTracker = mockData.pointTracker;
  //     // console.log(duplicatePointTracker);
  //     try {
  //       const response = await superagent.post(`${apiUrl}/pointstracker`)
  //         .authBearer(token)
  //         .send(duplicatePointTracker);
  //       expect(response).toEqual('Unexpected 409 Duplicate');
  //     } catch (err) {
  //       expect(err.status).toEqual(409);
  //     }
  //   });

  //   test('api/v1/pointstracker 400 missing information', async () => {
  //     const mockPointTracker = await createPointTrackerMockPromise();
  //     mockData.subjects = null;
  //     try {
  //       const response = await superagent.post(`${apiUrl}/pointstracker`)
  //         .send(mockPointTracker);
  //       expect(response).toEqual('Unexpected 400 missing subjects');
  //     } catch (err) {
  //       expect(err.status).toEqual(400);
  //     }
  //   });
  // });


  // describe('Points Tracker information retrieval (GET requests)', () => {
  //   test('GET 200 to api/v1/pointstracker for successful retrieval of a points tracking sheet', async () => {
  //     try {
  //       const response = await superagent.get(`${apiUrl}/pointstracker`);
  //       expect(response.status).toEqual(200);
  //       expect(response.body.token).toBeTruthy();
  //       expect(response.body.studentId).toBeDefined();
  //       expect(response.body.subjects).toEqual(mockPointTracker.subjects);
  //     } catch (err) {
  //       expect(err.status).toEqual('Unexpected error response from valid get request');
  //     }
  //   });
  // });

  describe('Points Tracker information retrieval (GET requests)', () => {
    test('GET 200 to api/v1/pointstracker for successful retrieval of a points tracking sheet', async () => {
      try {
        const response = await superagent.get(`${apiUrl}/pointstracker`);
        expect(response.status).toEqual(200);
        expect(response.body.token).toBeTruthy();
        expect(response.body.studentId).toBeDefined();
        expect(response.body.subjects).toEqual(mockData.subjects);
      } catch (err) {
        expect(err.status).toEqual('Unexpected error response from valid get request');
      }
    });


  //   test('GET 404 for pointstracker not found', async () => {
  //     const mockData = await createPointTrackerMockPromise();
  //     try {
  //       const response = await superagent.get(`${apiUrl}/pointstracker`);
  //       expect(response).toEqual(`GET POINTS ROUTER: ${mockData.studentId} not found.`);
  //     } catch (err) {
  //       expect(err.status).toEqual(404);
  //     }
  //   });

  //   test('GET 401 for unauthorized access', async () => {
  //     try {
  //       const mockData = await createPointTrackerMockPromise();
  //     const profile = mockData.profile; /*eslint-disable-line*/
  //     } catch (err) {
  //       throw err;
  //     }
  //     try {
  //     const response = await superagent.get(`${apiUrl}/pointstracker`)/*eslint-disable-line*/
  //         .query({ id: profile.accountId })
  //         .authBearer('Incorrect token');
  //       expect(response.status).toEqual('Unreachable code, dont worry about it GET 404');
  //     } catch (err) {
  //       expect(err.status).toEqual(401);
  //     }
  //   });


  // });

  });
});
