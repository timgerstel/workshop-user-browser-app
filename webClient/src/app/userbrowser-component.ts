import { Component, ViewChild, ElementRef, OnInit, AfterViewInit, Inject, SimpleChange } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Http, Response} from '@angular/http';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/debounceTime';

import { Angular2InjectionTokens, Angular2PluginWindowActions, Angular2PluginWindowEvents } from 'pluginlib/inject-resources';

@Component({
  selector: 'userbrowser',
  templateUrl: 'userbrowser-component.html',
  styleUrls: ['userbrowser-component.css']
})

export class UserBrowserComponent implements OnInit, AfterViewInit {
  @ViewChild('grid') grid; //above the constructor

  private submitSelectionAction: ZLUX.Action; 

  private simpleText: string;
  private resultNotReady: boolean = false;
  private showGrid: boolean = false;
  private columnMetaData: any = null;
  private unfilteredRows: any = null;
  private rows: any = null;
  private selectedRows: any[];  
  private query: string;
  private error_msg: any;
  private url: string;
  private filter:any;

  constructor(
    private element: ElementRef,
    private http: Http,
    @Inject(Angular2InjectionTokens.LOGGER) private log: ZLUX.ComponentLogger,
    @Inject(Angular2InjectionTokens.PLUGIN_DEFINITION) private pluginDefinition: ZLUX.ContainerPluginDefinition,    
    @Inject(Angular2InjectionTokens.WINDOW_ACTIONS) private windowAction: Angular2PluginWindowActions,
    @Inject(Angular2InjectionTokens.WINDOW_EVENTS) private windowEvents: Angular2PluginWindowEvents,
    //Now, if this is not null, we're provided with some context of what to do on launch.
    @Inject(Angular2InjectionTokens.LAUNCH_METADATA) private launchMetadata: any,
  ) {
    this.submitSelectionAction = ZoweZLUX.dispatcher.makeAction(
      "org.openmainframe.zowe.workshop-user-browser.actions.submitselections",      
      "Sorts user table in App which has it",
      ZoweZLUX.dispatcher.constants.ActionTargetMode.PluginFindAnyOrCreate,
      ZoweZLUX.dispatcher.constants.ActionType.Message,
      "org.openmainframe.zowe.workshop-starter",
      {data: {op:'deref',source:'event',path:['data']}}
    );
    this.log.info(`User Browser constructor called`);

    //NOW: if provided with some startup context, act upon it... otherwise just load all.
    //Step: after making the grid... we add this to show that we can instruct an app to narrow its scope on open
    this.log.info(`Launch metadata provided=${JSON.stringify(this.launchMetadata)}`);
    if (this.launchMetadata != null && this.launchMetadata.data) {
    /* The message will always be an Object, but format can be specific. The format we are using here is in the Starter App: 
      https://github.com/zowe/workshop-starter-app/blob/master/webClient/src/app/workshopstarter-component.ts#L177
    */    
      switch (launchMetadata.data.type) {
      case 'load':
        if (launchMetadata.data.filter) {
          this.filter = launchMetadata.data.filter;
        }
        break;
      default:
        this.log.warn(`Unknown launchMetadata type`);
      }
    } else {
      this.log.info(`Skipping launching in a context due to missing or malformed launchMetadata object`);
    }
  }

    /* 
  I expect a JSON here, but the format can be specific depending on the Action - see the Starter App to see the format that is sent for the Workshop: 
  https://github.com/zowe/workshop-starter-app/blob/master/webClient/src/app/workshopstarter-component.ts#L225
  */
 zluxOnMessage(eventContext: any): Promise<any> {
  return new Promise((resolve,reject)=> {
    if (!eventContext || !eventContext.data) {
      return reject('Event context missing or malformed');
    }
    switch (eventContext.data.type) {
      case 'filter':
        let filterParms = eventContext.data.parameters;
        this.log.info(`Messaged to filter table by column=${filterParms.column}, value=${filterParms.value}`);

        for (let i = 0; i < this.columnMetaData.columnMetaData.length; i++) {
          if (this.columnMetaData.columnMetaData[i].columnIdentifier == filterParms.column) {
            //ensure it is a valid column
            this.rows = this.unfilteredRows.filter((row)=> {
              if (row[filterParms.column]===filterParms.value) {
                return true;
              } else {
                return false;
              }
            });           
            break;
          }
        }
        resolve();
        break;
      default:
        reject('Event context missing or unknown data.type');
      };
    });    
  }


  provideZLUXDispatcherCallbacks(): ZLUX.ApplicationCallbacks {
    return {
      onMessage: (eventContext: any): Promise<any> => {
        return this.zluxOnMessage(eventContext);
      }      
    }
  }

  ngOnInit(): void {
    this.resultNotReady = true;
    this.log.info(`Calling own dataservice to get user listing for filter=${JSON.stringify(this.filter)}`);
    let uri = this.filter ? ZoweZLUX.uriBroker.pluginRESTUri(this.pluginDefinition.getBasePlugin(), 'table', `${this.filter.type}/${this.filter.value}`) : ZoweZLUX.uriBroker.pluginRESTUri(this.pluginDefinition.getBasePlugin(), 'table',null);
    setTimeout(()=> {
    this.log.info(`Sending GET request to ${uri}`);
    this.http.get(uri).map(res=>res.json()).subscribe(
      data=>{
        this.log.info(`Successful GET, data=${JSON.stringify(data)}`);
        this.columnMetaData = data.metadata;
        this.unfilteredRows = data.rows.map(x=>Object.assign({},x));
        this.rows = this.unfilteredRows;
        this.showGrid = true;
        this.resultNotReady = false;
      },
      error=>{
        this.log.warn(`Error from GET. error=${error}`);
        this.error_msg = error;
        this.resultNotReady = false;
      }
    );
    },100);
  }

  ngAfterViewInit(): void {
    // the flex table div is not on the dom at this point
    // have to calculate the height for the table by subtracting all
    // the height of all fixed items from their container
    let fixedElems = this.element.nativeElement.querySelectorAll('div.include-in-calculation');
    let height = 0;
    fixedElems.forEach(function (elem, i) {
      height += elem.clientHeight;
    });
    this.windowEvents.resized.subscribe(() => {
      if (this.grid) {
        this.grid.updateRowsPerPage();
      }
    });
  }
  
  onTableSelectionChange(rows: any[]):void{
    this.selectedRows = rows;
  }

  submitSelectedUsers() {
    let plugin = ZoweZLUX.pluginManager.getPlugin("org.openmainframe.zowe.workshop-starter");
    if (!plugin) {
      this.log.warn(`Cannot request Workshop Starter App... It was not in the current environment!`);
      return;
    }

    ZoweZLUX.dispatcher.invokeAction(this.submitSelectionAction,
      {'data':{
         'type':'loadusers',
         'value':this.selectedRows
      }}
    );
  }

}