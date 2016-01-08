// Cronicle JobDetails Page

Class.subclass( Page.Base, "Page.JobDetails", {	
	
	pie_colors: {
		cool: 'green',
		warm: 'rgb(240,240,0)',
		hot: '#F7464A',
		progress: '#3f7ed5',
		empty: 'rgba(0, 0, 0, 0.05)'
	},
	
	onInit: function() {
		// called once at page load
		// var html = '';
		// this.div.html( html );
		this.charts = {};
	},
	
	onActivate: function(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		this.args = args;
		
		if (!args.id) {
			app.doError("The Job Details page requires a Job ID.");
			return true;
		}
		
		app.setWindowTitle( "Job Details: #" + args.id );
		app.showTabBar(true);
		
		this.tab.show();
		this.tab[0]._page_id = Nav.currentAnchor();
		
		if (app.activeJobs[args.id]) {
			// job is currently active -- jump to real-time view
			args.sub = 'live';
			this.gosub_live(args);
		}
		else {
			// job must be completed -- jump to archive view
			args.sub = 'archive';
			this.gosub_archive(args);
		}
		
		return true;
	},
	
	gosub_archive: function(args) {
		// show job archive
		this.div.addClass('loading');
		app.api.post( 'app/get_job_details', { id: args.id }, this.receive_details.bind(this) );
	},
	
	get_job_result_banner: function(job) {
		// render banner based on job result
		var icon = '';
		var type = '';
		if (job.abort_reason || job.unknown) {
			type = 'warning';
			icon = 'exclamation-circle';
		}
		else if (job.code) {
			type = 'error';
			icon = 'exclamation-triangle';
		}
		else {
			type = 'success';
			icon = 'check-circle';
		}
		
		if (!job.description && job.code) {
			job.description = "Job failed with code: " + job.code;
		}
		if (!job.code && (!job.description || job.description.replace(/\W+/, '').match(/^success(ful)?$/i))) {
			job.description = "Job completed successfully at " + get_nice_date_time(job.time_end, false, true);
			
			// add timezone abbreviation
			job.description += " " + moment.tz(job.time_end * 1000, app.tz).format('z');
		}
		if (job.code && !job.description.match(/^\s*error/i)) {
			var desc = job.description;
			job.description = "Error";
			if (job.code != 1) job.description += " " + job.code;
			job.description += ": " + desc;
		}
		
		var html = '';
		html += '<div class="message inline '+type+'"><div class="message_inner">';
		// html += '<div class="button mini right" style="position:relative; top:-3px;" onMouseUp="$P().run_again()">Run Again</div>';
		html += '<i class="fa fa-'+icon+' fa-lg" style="transform-origin:50% 50%; transform:scale(1.25); -webkit-transform:scale(1.25);">&nbsp;&nbsp;&nbsp;</i>' + job.description;
		html += '</div></div>';
		return html;
	},
	
	run_again: function() {
		// run job again
		var self = this;
		var event = find_object( app.schedule, { id: this.job.event } ) || null;
		if (!event) return app.doError("Could not locate event in schedule: " + this.job.event_title + " (" + this.job.event + ")");
		
		var job = deep_copy_object( event );
		job.now = this.job.now;
		job.params = this.job.params;
		
		app.showProgress( 1.0, "Starting job..." );
		
		app.api.post( 'app/run_event', job, function(resp) {
			// app.showMessage('success', "Event '"+event.title+"' has been started.");
			self.jump_live_job_id = resp.ids[0];
			self.jump_to_live_when_ready();
		} );
	},
	
	jump_to_live_when_ready: function() {
		// make sure live view is ready (job may still be starting)
		var self = this;
		if (!this.active) return; // user navigated away from page
		
		if (app.activeJobs[this.jump_live_job_id]) {
			app.hideProgress();
			Nav.go( 'JobDetails?id=' + this.jump_live_job_id );
			delete this.jump_live_job_id;
		}
		else {
			setTimeout( self.jump_to_live_when_ready.bind(self), 250 );
		}
	},
	
	receive_details: function(resp) {
		// receive job details from server, render them
		var html = '';
		var job = this.job = resp.job;
		this.div.removeClass('loading');
		
		var size = get_inner_window_size();
		var col_width = Math.floor( ((size.width * 0.9) - 300) / 4 );
		
		// locate objects
		var event = find_object( app.schedule, { id: job.event } ) || {};
		var cat = job.category ? find_object( app.categories, { id: job.category } ) : null;
		var group = event.target ? find_object( app.server_groups, { id: event.target } ) : null;
		var plugin = job.plugin ? find_object( app.plugins, { id: job.plugin } ) : null;
		
		if (group && event.multiplex) {
			group = copy_object(group);
			group.multiplex = 1;
		}
		
		// result banner
		html += this.get_job_result_banner(job);
		
		// fieldset header
		html += '<fieldset style="margin-top:8px; margin-right:0px; padding-top:10px; position:relative;"><legend>Completed Job Details</legend>';
			
			if (event.id && !event.multiplex) html += '<div class="button mini" style="position:absolute; top:15px; left:100%; margin-left:-110px;" onMouseUp="$P().run_again()">Run Again</div>';
			
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">JOB ID</div>';
				html += '<div class="info_value">' + job.id + '</div>';
				
				html += '<div class="info_label">EVENT NAME</div>';
				html += '<div class="info_value">';
					if (event.id) html += '<a href="#Schedule?sub=edit_event&id='+job.event+'">' + this.getNiceEvent(job.event_title, col_width) + '</a>';
					else if (job.event_title) html += this.getNiceEvent(job.event_title, col_width);
					else html += '(None)';
				html += '</div>';
				
				html += '<div class="info_label">EVENT TIMING</div>';
				html += '<div class="info_value">' + (event.enabled ? summarize_event_timing(event.timing, event.timezone) : '(Disabled)') + '</div>';
			html += '</div>';
			
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">CATEGORY NAME</div>';
				html += '<div class="info_value">';
					if (cat) html += this.getNiceCategory(cat, col_width);
					else if (job.category_title) html += this.getNiceCategory({ title: job.category_title }, col_width);
					else html += '(None)';
				html += '</div>';
				
				html += '<div class="info_label">PLUGIN NAME</div>';
				html += '<div class="info_value">';
					if (plugin) html += this.getNicePlugin(plugin, col_width);
					else if (job.plugin_title) html += this.getNicePlugin({ title: job.plugin_title }, col_width);
					else html += '(None)';
				html += '</div>';
				
				html += '<div class="info_label">EVENT TARGET</div>';
				html += '<div class="info_value">';
					if (group || event.target) html += this.getNiceGroup(group, event.target, col_width);
					else if (job.nice_target) html += '<div class="ellip" style="max-width:'+col_width+'px;">' + job.nice_target + '</div>';
					else html += '(None)';
				html += '</div>';
			html += '</div>';
			
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">JOB SOURCE</div>';
				html += '<div class="info_value">' + (job.source || 'Scheduler') + '</div>';
				
				html += '<div class="info_label">SERVER HOSTNAME</div>';
				html += '<div class="info_value">' + this.getNiceGroup( null, job.hostname, col_width ) + '</div>';
				
				html += '<div class="info_label">PROCESS ID</div>';
				html += '<div class="info_value">' + (job.detached_pid || job.pid || '(Unknown)') + '</div>';
			html += '</div>';
			
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">JOB STARTED</div>';
				html += '<div class="info_value">';
					if ((job.time_start - job.now >= 60) && !event.multiplex && !job.source) {
						html += '<span style="color:red" title="Scheduled Time: '+get_nice_date_time(job.now, false, true)+'">';
						html += get_nice_date_time(job.time_start, false, true);
						html += '</span>';
					}
					else html += get_nice_date_time(job.time_start, false, true);
				html += '</div>';
				
				html += '<div class="info_label">JOB COMPLETED</div>';
				html += '<div class="info_value">' + get_nice_date_time(job.time_end, false, true) + '</div>';
				
				html += '<div class="info_label">ELAPSED TIME</div>';
				html += '<div class="info_value">' + get_text_from_seconds(job.elapsed, false, false) + '</div>';
			html += '</div>';
			
			html += '<div class="clear"></div>';
		html += '</fieldset>';
		
		// pies
		html += '<div style="position:relative; margin-top:15px;">';
			
			html += '<div class="pie-column column-left">';
				html += '<div class="pie-title">Performance Metrics</div>';
				html += '<canvas id="c_arch_perf" width="250" height="250" class="pie"></canvas>';
				html += '<div id="d_arch_perf_legend" class="pie-legend-column"></div>';
			html += '</div>';
			
			html += '<div class="pie-column column-right">';
				html += '<div id="d_arch_mem_overlay" class="pie-overlay"></div>';
				html += '<div class="pie-title">Memory Usage</div>';
				html += '<canvas id="c_arch_mem" width="250" height="250" class="pie"></canvas>';
				html += '<div id="d_arch_mem_legend" class="pie-legend-column"></div>';
			html += '</div>';
			
			html += '<div class="pie-column column-center">';
				html += '<div id="d_arch_cpu_overlay" class="pie-overlay"></div>';
				html += '<div class="pie-title">CPU Usage</div>';
				html += '<canvas id="c_arch_cpu" width="250" height="250" class="pie"></canvas>';
				html += '<div id="d_arch_cpu_legend" class="pie-legend-column"></div>';
			html += '</div>';
			
		html += '</div>';
		
		// job log (IFRAME)
		html += '<div class="subtitle" style="margin-top:15px;">';
			html += 'Job Event Log';
			if (job.log_file_size) html += ' (' + get_text_from_bytes(job.log_file_size, 1) + ')';
			html += '<div class="subtitle_widget" style="margin-left:2px;"><i class="fa fa-external-link">&nbsp;</i><a href="'+app.base_api_url+'/app/get_job_log?id='+job.id+'" target="_blank"><b>View Full Log</b></a></div>';
			html += '<div class="subtitle_widget"><i class="fa fa-download">&nbsp;</i><a href="'+app.base_api_url+'/app/get_job_log?id='+job.id+'&download=1"><b>Download Log</b></a></div>';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		var size = get_inner_window_size();
		var iheight = size.height - 100;
		html += '<iframe id="i_arch_job_log" style="width:100%; height:'+iheight+'px; border:none;" frameborder="0" src="'+app.base_api_url+'/app/get_job_log?id='+job.id+'"></iframe>';
		
		this.div.html( html );
		
		// arch perf chart
		var suffix = ' sec';
		var pscale = 1;
		if (!job.perf) job.perf = { total: job.elapsed };
		if (!isa_hash(job.perf)) job.perf = parse_query_string( job.perf.replace(/\;/g, '&') );
		
		if (job.perf.scale) {
			pscale = job.perf.scale;
			delete job.perf.scale;
		}
		
		var options = {
			percentageInnerCutout: 0,
			animationEasing: "easeOutQuart",
			tooltipTemplate: '<%if (label){%><%=label%>: <%}%><%= value %>' + suffix,
			legendTemplate : '<div class="pie-legend-container">' + 
				'<% for (var i=0; i<segments.length; i++){%>' + 
					'<div class="pie-legend-item" style="background-color:<%=segments[i].fillColor%>">' + 
						'<%=segments[i].label%>' + 
					'</div>' + 
				'<%}%></div>'
		};
		
		var perf = job.perf.perf ? job.perf.perf : job.perf;
		
		// remove counters from pie
		for (var key in perf) {
			if (key.match(/^c_/)) delete perf[key];
		}
		
		// clean up total, add other
		if (perf.t) { perf.total = perf.t; delete perf.t; }
		if ((num_keys(perf) > 1) && perf.total) {
			if (!perf.other) {
				var totes = 0;
				for (var key in perf) {
					if (key != 'total') totes += perf[key];
				}
				if (totes < perf.total) {
					perf.other = perf.total - totes;
				}
			}
			delete perf.total; // only show total if by itself
		}
		
		// remove outer 'umbrella' perf keys if inner ones are more specific
		// (i.e. remove "db" if we have "db_query" and/or "db_connect")
		for (var key in perf) {
			for (var subkey in perf) {
				if ((subkey.indexOf(key + '_') == 0) && (subkey.length > key.length + 1)) {
					delete perf[key];
					break;
				}
			}
		}
		
		// divide everything by scale, so we get seconds
		for (var key in perf) {
			perf[key] /= pscale;
		}
		
		var colors = this.graph_colors;
		var color_idx = 0;
		
		var data = [];
		var perf_keys = hash_keys_to_array(perf).sort();
		for (var idx = 0, len = perf_keys.length; idx < len; idx++) {
			var key = perf_keys[idx];
			var value = perf[key];
			data.push({
				value: short_float(value),
				label: key,
				color: 'rgb(' + colors[color_idx] + ')',
				// brighten colors by 1/3 for highlight
				highlight: 'rgb(' + colors[color_idx].split(/\,\s*/).map( function(v) { v = parseInt(v); return Math.floor( v + ((255 - v) / 3) ); } ).join(',') + ')',
			});
			color_idx = (color_idx + 1) % colors.length;
		}
		
		var ctx = $("#c_arch_perf").get(0).getContext("2d");
		var perf_chart = new Chart(ctx).Doughnut( data, options );
		var perf_legend = $('#d_arch_perf_legend');
		perf_legend.html( perf_chart.generateLegend() );
		
		// add mouse events to perf legend
		// Known Chart.js Bug: Tooltip doesn't appear when you mouseover the same legend item twice
		perf_legend.find('div.pie-legend-item').each( function(idx) {
			$(this).on('mouseover', function(e) {
				var seg = perf_chart.segments[idx];
				seg.save();
				seg.fillColor = seg.highlightColor;
				perf_chart.showTooltip([seg]);
				seg.restore();
			} );
		} );
		perf_legend.find('div.pie-legend-item').on('mouseout', function(e) {
			perf_chart.draw();
		});
		
		this.charts.perf = perf_chart;
		
		// arch cpu pie
		var options = {
			percentageInnerCutout: 50,
			animationEasing: "easeOutQuart",
			showTooltips: false
		};
		
		var cpu_avg = 0;
		if (!job.cpu) job.cpu = {};
		if (job.cpu.total && job.cpu.count) {
			cpu_avg = short_float( job.cpu.total / job.cpu.count );
		}
		
		var jcm = 100;
		var data = [
			{
				value: Math.min(cpu_avg, jcm),
				color: (cpu_avg < jcm*0.5) ? this.pie_colors.cool : 
					((cpu_avg < jcm*0.75) ? this.pie_colors.warm : this.pie_colors.hot)
			},
			{
				value: jcm - Math.min(cpu_avg, jcm),
				color: this.pie_colors.empty
			}
		];
		
		var ctx = $("#c_arch_cpu").get(0).getContext("2d");
		var cpu_chart = new Chart(ctx).Doughnut( data, options );
		
		// arch cpu overlay
		var html = '';
		html += '<div class="pie-overlay-title">'+cpu_avg+'%</div>';
		html += '<div class="pie-overlay-subtitle">Average</div>';
		$('#d_arch_cpu_overlay').html( html );
		
		// arch cpu legend
		var html = '';
		
		html += '<div class="info_label">MIN</div>';
		html += '<div class="info_value">' + (job.cpu.min || 0) + '%</div>';
		
		html += '<div class="info_label">PEAK</div>';
		html += '<div class="info_value">' + (job.cpu.max || 0) + '%</div>';
		
		$('#d_arch_cpu_legend').html( html );
		
		this.charts.cpu = cpu_chart;
		
		// arch mem pie
		var options = {
			percentageInnerCutout: 50,
			animationEasing: "easeOutQuart",
			showTooltips: false
		};
		
		var mem_avg = 0;
		if (!job.mem) job.mem = {};
		if (job.mem.total && job.mem.count) {
			mem_avg = Math.floor( job.mem.total / job.mem.count );
		}
		
		var jmm = config.job_memory_max || 1073741824;
		var data = [
			{
				value: Math.min(mem_avg, jmm),
				color: (mem_avg < jmm*0.5) ? this.pie_colors.cool : 
					((mem_avg < jmm*0.75) ? this.pie_colors.warm : this.pie_colors.hot)
			},
			{
				value: jmm - Math.min(mem_avg, jmm),
				color: this.pie_colors.empty
			}
		];
		
		var ctx = $("#c_arch_mem").get(0).getContext("2d");
		var mem_chart = new Chart(ctx).Doughnut( data, options );
		
		// arch mem overlay
		var html = '';
		html += '<div class="pie-overlay-title">'+get_text_from_bytes(mem_avg, 1)+'</div>';
		html += '<div class="pie-overlay-subtitle">Average</div>';
		$('#d_arch_mem_overlay').html( html );
		
		// arch mem legend
		var html = '';
		
		html += '<div class="info_label">MIN</div>';
		html += '<div class="info_value">' + get_text_from_bytes(job.mem.min || 0, 1) + '</div>';
		
		html += '<div class="info_label">PEAK</div>';
		html += '<div class="info_value">' + get_text_from_bytes(job.mem.max || 0, 1) + '</div>';
		
		$('#d_arch_mem_legend').html( html );
		
		this.charts.mem = mem_chart;
	},
	
	abort_job: function() {
		// abort job, after confirmation
		var job = app.activeJobs[this.args.id];
		
		app.confirm( '<span style="color:red">Abort Job</span>', "Are you sure you want to abort the current job?", "Abort", function(result) {
			if (result) {
				app.showProgress( 1.0, "Aborting job..." );
				app.api.post( 'app/abort_job', job, function(resp) {
					app.hideProgress();
					app.showMessage('success', "Job '"+job.event_title+"' was aborted successfully.");
				} );
			}
		} );
	},
	
	gosub_live: function(args) {
		// show live job status
		var job = app.activeJobs[args.id];
		var html = '';
		this.div.removeClass('loading');
		
		var size = get_inner_window_size();
		var col_width = Math.floor( ((size.width * 0.9) - 300) / 4 );
		
		// locate objects
		var event = find_object( app.schedule, { id: job.event } ) || {};
		var cat = job.category ? find_object( app.categories, { id: job.category } ) : { title: 'n/a' };
		var group = event.target ? find_object( app.server_groups, { id: event.target } ) : null;
		var plugin = job.plugin ? find_object( app.plugins, { id: job.plugin } ) : { title: 'n/a' };
		
		if (group && event.multiplex) {
			group = copy_object(group);
			group.multiplex = 1;
		}
		
		// fieldset header
		html += '<fieldset style="margin-top:0px; margin-right:0px; padding-top:10px; position:relative"><legend>Live Job Details</legend>';
			
			html += '<div class="button mini" style="position:absolute; top:15px; left:100%; margin-left:-110px;" onMouseUp="$P().abort_job()">Abort Job...</div>';
			
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">JOB ID</div>';
				html += '<div class="info_value">' + job.id + '</div>';
				
				html += '<div class="info_label">EVENT NAME</div>';
				html += '<div class="info_value"><a href="#Schedule?sub=edit_event&id='+job.event+'">' + this.getNiceEvent(job.event_title, col_width) + '</a></div>';
				
				html += '<div class="info_label">EVENT TIMING</div>';
				html += '<div class="info_value">' + (event.enabled ? summarize_event_timing(event.timing, event.timezone) : '(Disabled)') + '</div>';
			html += '</div>';
			
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">CATEGORY NAME</div>';
				html += '<div class="info_value">' + this.getNiceCategory(cat, col_width) + '</div>';
				
				html += '<div class="info_label">PLUGIN NAME</div>';
				html += '<div class="info_value">' + this.getNicePlugin(plugin, col_width) + '</div>';
				
				html += '<div class="info_label">EVENT TARGET</div>';
				html += '<div class="info_value">' + this.getNiceGroup(group, event.target, col_width) + '</div>';
			html += '</div>';
			
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">JOB SOURCE</div>';
				html += '<div class="info_value">' + (job.source || 'Scheduler') + '</div>';
				
				html += '<div class="info_label">SERVER HOSTNAME</div>';
				html += '<div class="info_value">' + this.getNiceGroup( null, job.hostname, col_width ) + '</div>';
				
				html += '<div class="info_label">PROCESS ID</div>';
				html += '<div class="info_value" id="d_live_pid">' + job.pid + '</div>';
			html += '</div>';
							
			html += '<div style="float:left; width:25%;">';
				html += '<div class="info_label">JOB STARTED</div>';
				html += '<div class="info_value">' + get_nice_date_time(job.time_start, false, true) + '</div>';
				
				html += '<div class="info_label">ELAPSED TIME</div>';
				var elapsed = Math.floor( Math.max( 0, app.epoch - job.time_start ) );
				html += '<div class="info_value" id="d_live_elapsed">' + get_text_from_seconds(elapsed, false, false) + '</div>';
				
				var progress = job.progress || 0;
				var nice_remain = 'n/a';
				if ((elapsed >= 10) && (progress > 0) && (progress < 1.0)) {
					var sec_remain = Math.floor(((1.0 - progress) * elapsed) / progress);
					nice_remain = get_text_from_seconds( sec_remain, false, true );
				}
				html += '<div class="info_label">REMAINING TIME</div>';
				html += '<div class="info_value" id="d_live_remain">' + nice_remain + '</div>';
			html += '</div>';
			
			html += '<div class="clear"></div>';
		html += '</fieldset>';
		
		// pies
		html += '<div style="position:relative; margin-top:15px;">';
			
			html += '<div class="pie-column column-left">';
				html += '<div id="d_live_progress_overlay" class="pie-overlay"></div>';
				html += '<div class="pie-title">Job Progress</div>';
				html += '<canvas id="c_live_progress" width="250" height="250" class="pie"></canvas>';
				// html += '<div id="d_live_progress_legend" class="pie-legend-column"></div>';
			html += '</div>';
			
			html += '<div class="pie-column column-right">';
				html += '<div id="d_live_mem_overlay" class="pie-overlay"></div>';
				html += '<div class="pie-title">Memory Usage</div>';
				html += '<canvas id="c_live_mem" width="250" height="250" class="pie"></canvas>';
				html += '<div id="d_live_mem_legend" class="pie-legend-column"></div>';
			html += '</div>';
			
			html += '<div class="pie-column column-center">';
				html += '<div id="d_live_cpu_overlay" class="pie-overlay"></div>';
				html += '<div class="pie-title">CPU Usage</div>';
				html += '<canvas id="c_live_cpu" width="250" height="250" class="pie"></canvas>';
				html += '<div id="d_live_cpu_legend" class="pie-legend-column"></div>';
			html += '</div>';
			
		html += '</div>';
		
		// live job log tail
		var remote_api_url = app.proto + job.hostname + ':' + app.port + config.base_api_uri;
		
		html += '<div class="subtitle" style="margin-top:15px;">';
			html += 'Live Job Event Log';
			html += '<div class="subtitle_widget" style="margin-left:2px;"><i class="fa fa-external-link">&nbsp;</i><a href="'+remote_api_url+'/app/get_live_job_log?id='+job.id+'" target="_blank"><b>View Full Log</b></a></div>';
			html += '<div class="subtitle_widget"><i class="fa fa-download">&nbsp;</i><a href="'+remote_api_url+'/app/get_live_job_log?id='+job.id+'&download=1"><b>Download Log</b></a></div>';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		var size = get_inner_window_size();
		var iheight = size.height - 100;
		html += '<div id="d_live_job_log" style="width:100%; height:'+iheight+'px; overflow-y:scroll; position:relative;"></div>';
		
		this.div.html( html );
		
		// open websocket for log tail stream
		this.start_live_log_watcher(job);
		
		// live progress pie
		var options = {
			percentageInnerCutout: 50,
			animationEasing: "easeOutQuart",
			showTooltips: false
		};
		
		if (!job.progress) job.progress = 0;
		var progress = Math.min(1, Math.max(0, job.progress));
		var prog_pct = short_float( progress * 100 );
		
		var data = [
			{
				value: prog_pct,
				color: this.pie_colors.progress
			},
			{
				value: 100 - prog_pct,
				color: this.pie_colors.empty
			}
		];
		
		var ctx = $("#c_live_progress").get(0).getContext("2d");
		var progress_chart = new Chart(ctx).Doughnut( data, options );
		
		this.charts.progress = progress_chart;
		
		// live cpu pie
		var options = {
			percentageInnerCutout: 50,
			animationEasing: "easeOutQuart",
			showTooltips: false
		};
		
		if (!job.cpu) job.cpu = {};
		if (!job.cpu.current) job.cpu.current = 0;
		var cpu_cur = job.cpu.current;
		var cpu_avg = 0;
		if (job.cpu.total && job.cpu.count) {
			cpu_avg = short_float( job.cpu.total / job.cpu.count );
		}
		
		var jcm = 100;
		var data = [
			{
				value: Math.min(cpu_cur, jcm),
				color: (cpu_cur < jcm*0.5) ? this.pie_colors.cool : 
					((cpu_cur < jcm*0.75) ? this.pie_colors.warm : this.pie_colors.hot)
			},
			{
				value: jcm - Math.min(cpu_cur, jcm),
				color: this.pie_colors.empty
			}
		];
		
		var ctx = $("#c_live_cpu").get(0).getContext("2d");
		var cpu_chart = new Chart(ctx).Doughnut( data, options );
		
		this.charts.cpu = cpu_chart;
		
		// live mem pie
		var options = {
			percentageInnerCutout: 50,
			animationEasing: "easeOutQuart",
			showTooltips: false
		};
		
		if (!job.mem) job.mem = {};
		if (!job.mem.current) job.mem.current = 0;
		var mem_cur = job.mem.current;
		var mem_avg = 0;
		if (job.mem.total && job.mem.count) {
			mem_avg = short_float( job.mem.total / job.mem.count );
		}
		
		var jmm = config.job_memory_max || 1073741824;
		var data = [
			{
				value: Math.min(mem_cur, jmm),
				color: (mem_cur < jmm*0.5) ? this.pie_colors.cool : 
					((mem_cur < jmm*0.75) ? this.pie_colors.warm : this.pie_colors.hot)
			},
			{
				value: jmm - Math.min(mem_cur, jmm),
				color: this.pie_colors.empty
			}
		];
		
		var ctx = $("#c_live_mem").get(0).getContext("2d");
		var mem_chart = new Chart(ctx).Doughnut( data, options );
		
		this.charts.mem = mem_chart;
		
		// update dynamic data
		this.update_live_progress(job);
	},
	
	start_live_log_watcher: function(job) {
		// open special websocket to target server for live log feed
		var self = this;
		var $cont = null;
		var chunk_count = 0;
		
		this.socket = io( app.proto + job.hostname + ':' + app.port, {
			forceNew: true,
			reconnection: true,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			reconnectionAttempts: 9999,
			timeout: 5000
		} );
		
		this.socket.on('connect', function() {
			Debug.trace("JobDetails socket.io connected successfully");
			
			// cache this for later
			$cont = $('#d_live_job_log');
			
			// request log stream + authenticate
			self.socket.emit( 'watch_job_log', {
				token: app.getPref('session_id'),
				id: job.id
			} );
		} );
		this.socket.on('connect_error', function(err) {
			Debug.trace("JobDetails socket.io connect error: " + err);
		} );
		this.socket.on('connect_timeout', function(err) {
			Debug.trace("JobDetails socket.io connect timeout");
		} );
		this.socket.on('reconnect', function() {
			Debug.trace("JobDetails socket.io reconnected successfully");
		} );
		
		this.socket.on('log_data', function(lines) {
			// received log data, as array of lines
			var scroll_y = $cont.scrollTop();
			var scroll_max = Math.max(0, $cont.prop('scrollHeight') - $cont.height());
			var need_scroll = ((scroll_max - scroll_y) <= 10);
			
			$cont.append( 
				'<pre class="log_chunk">' + 
					lines.map( function(line) { return line.replace(/</g, '&lt;'); } ).join("\n").trim() + 
				'</pre>' 
			);
			
			// only show newest 1K chunks
			chunk_count++;
			if (chunk_count >= 1000) {
				$cont.children().first().remove();
				chunk_count--;
			}
			
			if (need_scroll) $cont.scrollTop( $cont.prop('scrollHeight') );
		} );
	},
	
	update_live_progress: function(job) {
		// update job progress, elapsed time, time remaining, cpu pie, mem pie
		if (job.complete && !app.progress) app.showProgress( 1.0, "Job is finishing..." );
		
		// pid may have changed (retry)
		$('#d_live_pid').html( job.pid || 'n/a' );
		
		// elapsed time
		var elapsed = Math.floor( Math.max( 0, app.epoch - job.time_start ) );
		$('#d_live_elapsed').html( get_text_from_seconds(elapsed, false, false) );
		
		// remaining time
		var progress = job.progress || 0;
		var nice_remain = 'n/a';
		if (job.pending && job.when) {
			nice_remain = 'Retry in '+get_text_from_seconds( Math.max(0, job.when - app.epoch), true, true )+'';
		}
		else if ((elapsed >= 10) && (progress > 0) && (progress < 1.0)) {
			var sec_remain = Math.floor(((1.0 - progress) * elapsed) / progress);
			nice_remain = get_text_from_seconds( sec_remain, false, true );
		}
		$('#d_live_remain').html( nice_remain );
		
		// progress pie
		if (!job.progress) job.progress = 0;
		var progress = Math.min(1, Math.max(0, job.progress));
		var prog_pct = short_float( progress * 100 );
		
		this.charts.progress.segments[0].value = prog_pct;
		this.charts.progress.segments[1].value = 100 - prog_pct;
		this.charts.progress.update();
		
		// progress overlay
		var html = '';
		html += '<div class="pie-overlay-title">'+Math.floor(prog_pct)+'%</div>';
		html += '<div class="pie-overlay-subtitle">Current</div>';
		$('#d_live_progress_overlay').html( html );
		
		// cpu pie
		if (!job.cpu) job.cpu = {};
		if (!job.cpu.current) job.cpu.current = 0;
		var cpu_cur = job.cpu.current;
		var cpu_avg = 0;
		if (job.cpu.total && job.cpu.count) {
			cpu_avg = short_float( job.cpu.total / job.cpu.count );
		}
		
		var jcm = 100;
		this.charts.cpu.segments[0].value = Math.min(cpu_cur, jcm);
		this.charts.cpu.segments[0].fillColor = (cpu_cur < jcm*0.5) ? this.pie_colors.cool : ((cpu_cur < jcm*0.75) ? this.pie_colors.warm : this.pie_colors.hot);
		this.charts.cpu.segments[1].value = jcm - Math.min(cpu_cur, jcm);
		this.charts.cpu.update();
		
		// live cpu overlay
		var html = '';
		html += '<div class="pie-overlay-title">'+cpu_cur+'%</div>';
		html += '<div class="pie-overlay-subtitle">Current</div>';
		$('#d_live_cpu_overlay').html( html );
		
		// live cpu legend
		var html = '';
		
		html += '<div class="info_label">MIN</div>';
		html += '<div class="info_value">' + (job.cpu.min || 0) + '%</div>';
		
		html += '<div class="info_label">AVERAGE</div>';
		html += '<div class="info_value">' + (cpu_avg || 0) + '%</div>';
		
		html += '<div class="info_label">PEAK</div>';
		html += '<div class="info_value">' + (job.cpu.max || 0) + '%</div>';
		
		$('#d_live_cpu_legend').html( html );
		
		// mem pie
		if (!job.mem) job.mem = {};
		if (!job.mem.current) job.mem.current = 0;
		var mem_cur = job.mem.current;
		var mem_avg = 0;
		if (job.mem.total && job.mem.count) {
			mem_avg = short_float( job.mem.total / job.mem.count );
		}
		
		var jmm = config.job_memory_max || 1073741824;
		this.charts.mem.segments[0].value = Math.min(mem_cur, jmm);
		this.charts.mem.segments[0].fillColor = (mem_cur < jmm*0.5) ? this.pie_colors.cool : ((mem_cur < jmm*0.75) ? this.pie_colors.warm : this.pie_colors.hot);
		this.charts.mem.segments[1].value = jmm - Math.min(mem_cur, jmm);
		this.charts.mem.update();
		
		// live mem overlay
		var html = '';
		html += '<div class="pie-overlay-title">'+get_text_from_bytes(mem_cur, 1)+'</div>';
		html += '<div class="pie-overlay-subtitle">Current</div>';
		$('#d_live_mem_overlay').html( html );
		
		// live mem legend
		var html = '';
		
		html += '<div class="info_label">MIN</div>';
		html += '<div class="info_value">' + get_text_from_bytes(job.mem.min || 0, 1) + '</div>';
		
		html += '<div class="info_label">AVERAGE</div>';
		html += '<div class="info_value">' + get_text_from_bytes(mem_avg || 0, 1) + '</div>';
		
		html += '<div class="info_label">PEAK</div>';
		html += '<div class="info_value">' + get_text_from_bytes(job.mem.max || 0, 1) + '</div>';
		
		$('#d_live_mem_legend').html( html );
	},
	
	jump_to_archive_when_ready: function() {
		// make sure archive view is ready (job log may still be uploading)
		var self = this;
		if (!this.active) return; // user navigated away from page
		
		app.api.post( 'app/get_job_details', { id: this.args.id, need_log: 1 }, 
			function(resp) {
				// got it, ready to switch
				app.hideProgress();
				Nav.refresh();
			},
			function(err) {
				// job not complete yet
				if (!app.progress) app.showProgress( 1.0, "Job is finishing..." );
				// self.jump_timer = setTimeout( self.jump_to_archive_when_ready.bind(self), 1000 );
			}
		);
	},
	
	onStatusUpdate: function(data) {
		// received status update (websocket), update sub-page if needed
		if (this.args.sub == 'live') {
			if (!app.activeJobs[this.args.id]) {
				// check for pending job (retry delay)
				var pending_job = null;
				for (var key in app.activeJobs) {
					var job = app.activeJobs[key];
					if (job.pending && (job.id == this.args.id)) {
						pending_job = job;
						break;
					}
				}
				
				if (pending_job) {
					// job switched to pending (retry delay)
					this.update_live_progress( pending_job );
				}
				else {
					// the live job we were watching just completed, jump to archive view
					this.jump_to_archive_when_ready();
				}
			}
			else {
				// job is still active
				this.update_live_progress(app.activeJobs[this.args.id]);
			}
		}
	},
	
	onResize: function(size) {
		// window was resized
		var iheight = size.height - 110;
		if (this.args.sub == 'live') {
			$('#d_live_job_log').css( 'height', '' + iheight + 'px' );
		}
		else {
			$('#i_arch_job_log').css( 'height', '' + iheight + 'px' );
		}
	},
	
	onResizeDelay: function(size) {
		// called 250ms after latest window resize
		// so we can run more expensive redraw operations
	},
	
	onDeactivate: function() {
		// called when page is deactivated
		for (var key in this.charts) {
			this.charts[key].destroy();
		}
		if (this.jump_timer) {
			clearTimeout( this.jump_timer );
			delete this.jump_timer;
		}
		if (this.socket) {
			this.socket.disconnect();
			delete this.socket;
		}
		this.charts = {};
		this.div.html( '' );
		// this.tab.hide();
		return true;
	}
	
});