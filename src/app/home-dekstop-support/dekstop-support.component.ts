import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { CouchdbService } from '../couchdb.service'; // Adjust import path
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

// Define an interface for the desktop support document
export interface DesktopSupportDocument {
  _id: string;
  _rev: string;
  data: {
    type: string;
    subtype: string;
    employeeId: string;
    module: string;
    title: string;
    contactNumber: string;
    location: string;
    expectedDate: string;
    problemDescription: string;
    date: string; // Or Date if you convert it later
  };
}

@Component({
  selector: 'app-dekstop-support',
  templateUrl: './dekstop-support.component.html',
  styleUrls: ['./dekstop-support.component.css']
})
export class DekstopSupportComponent implements OnInit, OnDestroy {
  serviceRequestIds: string[] = [];
  employee: any = null;
  leaveDetails: any = null;
  employeeId: string = ''; // Initialize as empty or null
  private changesSubscription: Subscription | undefined;
  private url = 'https://192.168.57.185:5984/employee-db/_changes?feed=longpoll&include_docs=true';
  private pollingInterval = 1000; // Poll every 1 second

  isLeaveReportOpen: boolean = false; // Control the dropdown visibility
  desktopSupportDocuments: DesktopSupportDocument[] = []; // Store fetched documents
  selectedDocument: DesktopSupportDocument | null = null; // Store selected document
  expandedDesktopDocumentId: string | null = null; // Property to track the expanded document

  constructor(
    private http: HttpClient,
    private router: Router,
    private couchdbService: CouchdbService
  ) {}
  selectDocument(document: DesktopSupportDocument): void {
    this.selectedDocument = document; // Set the selected document
  }
  toggleDesktopSupportDetails(documentId: string): void {
    this.expandedDesktopDocumentId = this.expandedDesktopDocumentId === documentId ? null : documentId; // Toggle logic
  }
  getFormattedDate(isoDate: string): string {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`; // Format as dd/mm/yyyy
  }
  ngOnInit(): void {
    this.employeeId = sessionStorage.getItem('employeeId') || '';
    if (this.employeeId) {
      this.fetchDesktopSupportDocuments(this.employeeId); // Fetch Desktop Support docs
    } else {
      console.error('No employee ID found in session storage.');
    }
    this.fetchEmployeeDetails();
    this.listenForChanges(); // Start listening for CouchDB changes
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

  showServiceRequests(): void {
    this.router.navigate(['/service-requests']); // Define the route for service requests
  }

  showDekstopSupport(): void {
    this.router.navigate(['/dekstop-support']); // Define the route for desktop support
  }

  showLeaveSummary(): void {
    this.router.navigate(['/leave-report']);
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
      const leaveUrl = `https://192.168.57.185:5984/employee-db/_design/leave/_view/by_employee?key="${employeeId}"`;
      const headers = new HttpHeaders({
        'Authorization': 'Basic ' + btoa('d_couchdb:Welcome#2')
      });

      // Fetch employee details
      this.http.get<any>(employeeUrl, { headers }).subscribe(
        (employeeResponse) => {
          if (employeeResponse && employeeResponse.data) {
            this.employee = employeeResponse.data;

            // Fetch leave records
            this.http.get<{ rows: LeaveDocument[] }>(leaveUrl, { headers }).subscribe(
              (leaveResponse) => {
                if (leaveResponse && leaveResponse.rows) {
                  this.leaveDetails = {
                    leaveBalance: 0, // Initialize as needed
                    casualLeaveBalance: 0,
                    medicalLeaveBalance: 0,
                    Leaves: leaveResponse.rows.map(row => row.value)
                  };
                } else {
                  console.error('No leave data found in the response.');
                }
              },
              (error) => {
                console.error('Error fetching leave data:', error);
              }
            );
          } else {
            console.error('No employee data found in the response.');
          }
        },
        (error) => {
          console.error('Error fetching employee data:', error);
        }
      );
    } else {
      console.error('No employee ID found in session storage.');
    }
  }
  fetchDesktopSupportDocuments(employeeId: string): void {
    const desktopSupportUrl = `https://192.168.57.185:5984/employee-db/_design/desktop_support/_view/by_employee?key=${encodeURIComponent('"' + employeeId + '"')}&include_docs=true`;
    const headers = this.getHeaders(); // Method that generates headers with authorization
  
    // Fetch Desktop Support documents based on employee ID
    this.http.get<{ rows: { doc: any }[] }>(desktopSupportUrl, { headers }).subscribe(
      (response) => {
     
        if (response.rows && response.rows.length > 0) {
          // Extract documents
          this.desktopSupportDocuments = response.rows.map(row => row.doc);
        } else {
          console.error('No Desktop Support documents found for this employee.');
          this.desktopSupportDocuments = []; // Ensure this is empty if no documents found
        }
      },
      (error) => {
        console.error('Error fetching Desktop Support documents:', error);
      }
    );
  }
  

  listenForChanges(): void {
    // Polling using RxJS timer and switchMap
    this.changesSubscription = timer(0, this.pollingInterval).pipe(
      switchMap(() => this.http.get<any>(this.url, { headers: this.getHeaders() }))
    ).subscribe(
      (response) => {
        // Handle updates here
        this.fetchDesktopSupportDocuments(this.employeeId);
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
