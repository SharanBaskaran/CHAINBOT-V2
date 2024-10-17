import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

// Define an interface for the leave document
interface LeaveDocument {
  id: string;
  key: string;
  value: {
    _id: string;
    _rev: string;
    type: string;
    employee: string;
    leaveType: string;
    leaveReason: string;
    startDate: string;
    endDate: string;
    leaveDays: string;
    lossOfPay: string;
    date: string;
  };
}

@Component({
  selector: 'app-my-details',
  templateUrl: './my-details.component.html',
  styleUrls: ['./my-details.component.css']
})
export class MyDetailsComponent implements OnInit, OnDestroy {
  employee: any = null;
  leaveDetails: any = null;
  private changesSubscription: Subscription | undefined;
  private url = 'https://192.168.57.185:5984/employee-db/_changes?feed=longpoll&include_docs=true';
  private pollingInterval = 100000000000; // Poll every 1 second
  isLeaveReportOpen: boolean = false; // Control the dropdown visibility


  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.fetchEmployeeDetails();
    this.listenForChanges();
  }
  isLeaveMenuOpen: boolean = false;

  toggleLeaveMenu() {
    this.isLeaveMenuOpen = !this.isLeaveMenuOpen;
  }
  showMyDetails(): void {
    this.router.navigate(['/my-details']);
  }

  showLeaveDetails(): void {
    this.router.navigate(['/leave-details']);
    this.isLeaveReportOpen = !this.isLeaveReportOpen; // Toggle the dropdown
  }

  showLeaveSummary(): void {
    this.router.navigate(['/leave-report']);
  }

  showServiceRequests(): void {
    this.router.navigate(['/service-requests']); // Define the route for service requests
  }
  
  showDekstopSupport(): void {
    this.router.navigate(['/dekstop-support']); // Define the route for service requests
  }
  
  home(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }

  fetchEmployeeDetails(): void {
    const employeeId = sessionStorage.getItem('employeeId');
    if (employeeId) {
      const employeeUrl = `https://192.168.57.185:5984/employee-db/employee_2_${employeeId}`;
      const headers = new HttpHeaders({
        'Authorization': 'Basic ' + btoa('d_couchdb:Welcome#2')
      });
  
      // Fetch employee details
      this.http.get<any>(employeeUrl, { headers }).subscribe(
        employeeResponse => {
          if (employeeResponse && employeeResponse.data) {
            this.employee = employeeResponse.data;
  
            // Check if there are attachments
            if (employeeResponse._attachments) {
              const attachmentName = Object.keys(employeeResponse._attachments)[0]; // Assuming the first attachment is the photo
              this.fetchAttachment(employeeId, attachmentName);
            }
  
          } else {
            console.error('No employee data found in the response.');
          }
        },
        error => {
          console.error('Error fetching employee data:', error);
        }
      );
    } else {
      console.error('No employee ID found in session storage.');
    }
  }
  
  fetchAttachment(employeeId: string, attachmentName: string): void {
    const attachmentUrl = `https://192.168.57.185:5984/employee-db/employee_2_${employeeId}/${attachmentName}`;
    const headers = new HttpHeaders({
      'Authorization': 'Basic ' + btoa('d_couchdb:Welcome#2')
    });
  
    this.http.get(attachmentUrl, { headers, responseType: 'blob' }).subscribe(
      blob => {
        const objectURL = URL.createObjectURL(blob);
        this.employee.photoUrl = objectURL; // Store the image URL in the employee object
      },
      error => {
        console.error('Error fetching employee attachment:', error);
      }
    );
  }
  

  calculateLeaveBalances(): void {
    if (this.leaveDetails && this.leaveDetails.Leaves) {
      let totalLeaveBalance = 0;
      let casualLeaveBalance = 0;
      let medicalLeaveBalance = 0;

      this.leaveDetails.Leaves.forEach((leave: any) => {
        const leaveDays = parseInt(leave.leaveDays, 10) || 0;
        totalLeaveBalance += leaveDays;

        if (leave.leaveType.toLowerCase() === 'casual leave') {
          casualLeaveBalance += leaveDays;
        } else if (leave.leaveType.toLowerCase() === 'medical leave') {
          medicalLeaveBalance += leaveDays;
        }
      });

      this.leaveDetails.leaveBalance = totalLeaveBalance;
      this.leaveDetails.casualLeaveBalance = casualLeaveBalance;
      this.leaveDetails.medicalLeaveBalance = medicalLeaveBalance;
    }
  }

  sortLeaveRecords(): void {
    if (this.leaveDetails && this.leaveDetails.Leaves) {
      this.leaveDetails.Leaves.sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }
  }

  groupLeaveRecordsByMonth(): { monthYear: string; leaves: any[] }[] {
    const groupedRecords: { [key: string]: any[] } = {};
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'
    ];
  
    if (this.leaveDetails && this.leaveDetails.Leaves) {
      this.leaveDetails.Leaves.forEach((leave: any) => {
        const startDate = new Date(leave.startDate);
        const month = monthNames[startDate.getMonth()];
        const year = startDate.getFullYear();
        const monthYear = `${month} ${year}`;
  
        if (!groupedRecords[monthYear]) {
          groupedRecords[monthYear] = [];
        }
        groupedRecords[monthYear].push(leave);
      });
    }
  
    // Convert groupedRecords to an array of objects and sort by date
    const monthYearArray = Object.keys(groupedRecords).map(monthYear => ({
      monthYear,
      leaves: groupedRecords[monthYear]
    }));
  
    // Sort by year and month in descending order
    monthYearArray.sort((a, b) => {
      const [monthA, yearA] = a.monthYear.split(' ');
      const [monthB, yearB] = b.monthYear.split(' ');
  
      const yearComparison = parseInt(yearB, 10) - parseInt(yearA, 10);
      if (yearComparison !== 0) {
        return yearComparison;
      }
      
      return monthNames.indexOf(monthB) - monthNames.indexOf(monthA);
    });
  
    return monthYearArray;
  }

  listenForChanges(): void {
    // Polling using RxJS timer and switchMap
    this.changesSubscription = timer(0, this.pollingInterval).pipe(
      switchMap(() => this.http.get<any>(this.url, { headers: this.getHeaders() }))
    ).subscribe(
      (response) => {
        // Handle updates here
        this.fetchEmployeeDetails(); // Re-fetch data as needed
      },
      (error) => console.error('Polling error:', error)
    );
  }
  
  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': 'Basic ' + btoa('d_couchdb:Welcome#2')
    });
  }
  
  // Close EventSource when the component is destroyed
  ngOnDestroy(): void {
    // Unsubscribe from the polling subscription when the component is destroyed
    if (this.changesSubscription) {
      this.changesSubscription.unsubscribe();
    }
  }
}

