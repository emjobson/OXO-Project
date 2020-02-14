class City {
	/* The constructor takes in a list of data points representing the city, 
	where each data point takes the form (12-digit-geohash, curb_designation). 
	Store this data inside the class and perform any other work you need to do 
	for the other two methods in this class. Your goal here is to store the data 
	in a format that makes your search function accurate and time efficient.
	*/
	constructor(data){
		/* note: I am assuming that a data point is represented as an DataPoint object 
		with fields geohash and curb_designation. Thus, if d is of type DataPoint, you can
		access its geohash field by calling d.geohash. */

		/* I am also assuming that geohash is a string, and curb_designation is a numerical 
		value based on the given mapping function. */

		var dict = {};

		for (d of data){
			/* Extract a 6-digit geohash key from the original 12-digit geohash. This 6-digit geohash
			cell will include the original location as well as any other locations within a 
			~1.22km x .61km cell. Note: cell width depends on distance from equator. */
			var dict_key = d.geohash.slice(0, 6);

			/* if the key does not yet exist in the dictionary: create a new dictionary entry, create an array as 
			the key's value and place the data point inside the array */
			if (dict[dict_key] == undefined)
				dict[dict_key] = [d];

			/* if the key does exist: add the data point to the existing array which is stored 
			inside the key's value */
			else dict[dict_key].push(d);

		}

		/* Overall, the data is stored in a dictionary data object which partitions the space 
		into 6-digit geohash keys. Each key contains an array of any locations 
		within that larger geographical partition. This will allow us to quickly search for any points 
		nearby a given location by converting the given location into the appropriate key and indexing 
		into the dictionary. */
		this.data = dict;
	
	}
	
	/* @params: distance-- distance between user's location and data point, measured in meters
			   cb_value-- the data point's curb_designation score, a numerical value on a scale 1-10
	This function serves to provide a desirability value by taking into account both 
	the curb designation's raw score and the distance from the address. Note: smaller 
	values are MORE desirable than larger ones.
	@returns: a numerical integer value representing a desirability score */
	function score_calculate(distance, cb_value){

		/* I am going to make an assumption that users will most likely not want to walk more than 
		1km/1000m to get to their spot, especially if the weather is bad or it's been a long work day. */

		//measured in meters
		const max_radius = 1000;
		
		/* This variable represents a distance score on a scale of 1-100, where 1 is a very short 
		distance from the destination, and 100 is a very long distance that is equivalent to max_radius. 
		Scores over 100 represent distances outside of my max_radius variable and are therefore still possible 
		locations but are extremely undesirable due to their distance from the user. */
		var dist_norm = (distance/ max_radius) * 100;
		var dist_weight = .8;

		/* must put the cb_norm on the same scale as the dist_norm and we must
		subtract from 100 in order to make smaller values more desirable to align with dist_norm */ 
		var cbv_norm = 100 - (cb_value * 10 );
		var cbv_weight = .2;

		/* In general, I am weighing distance as a more important factor than the curb_designation.
		However, I am adjusting the weights if the pickup location would be extremely 
		inconvenient, which I decided should be scores of 2 or less. */
		if(cb_value <= 2 && cb_value > 0)
		{
			cbv_weight = cbv_weight + ((3 - cb_value) * .1);
			dist_weight = dist_weight - ((3 - cb_value) * .1);
		}

		/* I am going to use a curb_designation score of 0 to represent somewhere that you cannot park, 
		such as in front of a fire hydrant. */
		if(cb_value == 0)
		{
			/* return an extremely large value that would put these locations at the end of a sorted list */
			return 100000;
		}

		/* now we take a weighted average */
		return (dist_norm * dist_weight) + (cbv_norm * cbv_weight);
	}

	/* @params: address-the user's entered dropoff address’s 12-digit-geohash
	This method should search around “address” for the best curb spaces available. 
	@returns: array of top 10 curb spaces close to passed address (as mentioned above, 
	you’ll need to design a metric which takes into account (a) distance from address 
	and (b) curb_designation value.
	*/
	function search(address){
		//get potential dictionary key
		const dict_key = address.slice(0, 6);
		var points = [];

		//if key found: add all locations within it to points
		if (this.data[dict_key] != undefined)
			points = this.data[dict_key];
			
		/* edge case: the address is within 610m of the border(s) of one or more neighbor 6-digit geohash cells, 
		so we include those nearby cells in our search area */

		/* note: border_check is a helper function that I created, see implementation and behavior below */
		for (dir of border_check(address))
		{
			// if it is an adjacent direction (N, S, E, W)
			if (dir.length == 1)
			{
				var neigh_key = Geohash.adjacent(dict_key, dir);
				//if neighbor is in our dictionary
				if(this.data[neigh_key] != undefined)
					points = points.concat(this.data[neigh_key]);
			}

			// if it is a diagonal direction (NE, SE, NW, SE)
			if(dir.length == 2)
			{
				/* This is a helper function I have not implemented, but below defines its expected behavior.
				Note: I am using this function as if it were a static member function of the Geohash class.

				/**
			     * Determines diagonal cell in given diagonal direction (ex: SW, NE, etc.)
			     *
			     * @param   geohash - Cell to which diagonal cell is required.
			     * @param   direction - Direction from geohash (SW, NE, SE, NW).
			     * @returns {string} Geocode of diagonal cell.
			     * @throws  Invalid geohash.
			     
				static diagonal(geohash, direction) { }
				*/
				var neigh_key = Geohash.diagonal(dict_key, dir);
				if(this.data[neigh_key] != undefined)
					points = points.concat(this.data[neigh_key]);
			}
		}	
		
		/* Here we handle the very unlikely scenerio that there are no (or not enough) possible 
		pickup locations in the already queried nearest geohash cell(s). To deal with this, we search all
		neighboring 6-digit geohash cells. */
		if (points.legnth < 10)
		{
			/* this function is from the Geohash class and in this case it returns a dictionary representing 
			the 8 adjacent neighbors to our 6-digit geohash key in the form {{n,ne,e,se,s,sw,w,nw: string}} */
			var neighbors = Geohash.neighbors(dict_key);

			for (n in neighbors)
			{
				//first we check to see if we did not already add locations from this geohash neighbor
				if (!border_check(address).includes(n))
				{
					var neigh_key = neighbors[n];
					if (this.data[neigh_key] != undefined)
						points = points.concat(this.data[neigh_key]);
				}
			}
		}

		/* The intended behavior of this piece of code is to sort the array of data points in increasing 
		order based on their desirability scores, which are caluclated by the score_calculate function. */
		points.sort(function (a, b){
			let dist_a = GoogleMaps.getDistance(address, a.geohash);
			let dist_b = GoogleMaps.getDistance(address, b.geohash);

			//use my score_calculate function to get desirability scores
			let val_a = score_calculate(dist_a, a.curb_designation);
			let val_b = score_calculate(dist_b, b.curb_designation);
			return val_a - val_b;
		});

		/* Since lower scores are more desirable, we simply return an array of the data points 
		with the ten lowest scores if there are indeed at least ten points in the array. */
		if (points.length >= 10)
			return points.slice(0, 10);
		
		/* edge case: if there were no or too few locations found within this large search 
		region, we throw an alert. */

		/* note: I did this, because I am making the assumption that the user would rather wait for 
		a pickup location within a reasonable distance than walk to locations outside this region, which 
		would be a minimum of 1.83 km away. (1.83 = 3 * the height of a 6-digit geohash cell) */
		else if (points.length > 0)
		{
			window.alert("Fewer pickup locations found than expected.");
			return points;
		}

		else 
			window.alert("No nearby pickup locations found. Wait a few minutes and try again.");

	}

	/* @params: address -- 12-digit geohash string
	this is a helper function that returns an array list representing the directions of any 6-digit 
	geohash neighbors that are within 600m of the address bounds
	@returns: a list of string objects representing directions, example: ["n", "e", "ne"] 
	note: returns an empty list if no nearby borders */
	function border_check(address)
	{
		/* access lat and long bounds of the address's geohash, this function is found in the Geohash class and
		it returns a nested dictionary: {{sw: {lat: number, lon: number}, ne: {lat: number, lon: number}}} */
		const bounds_a = Geohash.bounds(address);

		//get 6-digit geohash parent of address
		const dict_key = address.slice(0,6);

		//access lat and long bounds of the parent
		const bounds_p = Geohash.bounds(dict_key);

		var near_borders= [];

		//meters, note: I chose this because it is 10m less than the height of a 6-digit geohash
		const radius = 600;

		//if we are less than 600 meters from the western border, add "w" to near_borders
		var west = Math.abs(bounds_p[sw][lon] - bounds_a[sw][lon]) < 600;
		if (west)
			near_borders.push("w");

		var south = Math.abs(bounds_p[sw][lat] - bounds_a[sw][lat] < 600
		if (south)
			near_borders.push("s");

		//corner case: if we are close to the western and southern borders, add "sw" to near_borders
		if(south && west)
			near_borders.push("sw");

		/* -- repeat for each of the other directions (N, S, E , NE, NW, SE)-- */

		return near_borders;
	}
	
	/* params: location -- a well-formed input (12-digit-geohash, curb_designation). 
	Update should take this information and update the data structure you initialized 
	in the City constructor. This function will either update the curb_designation 
	for an existing data point, or will insert a new data point. As an example, 
	imagine a user reports that a parking spot now has a hydrant. 
	returns: void
	*/
	function update(location){

		// obtain 6-digit geohash key from 12-digit location geohash
		var dict_key = location.geohash.slice(0, 6);

		// if key exists in the dictionary
		var points = this.data[dict_key];
		if (points != undefined)
		{
			//potentially find the index of an existing corresponding data point in the key's array
			var ind = points.findIndex(function(a){return a.geohash.equals(location.geohash)});
			
			//if there is an exisitng data point found, index into the array and modify the curb_designation value
			if(ind != -1)
				this.data[dict_key][ind].curb_designation = location.curb_designation;
			}
			
			//if no existing data point found but the key exists, push the new location onto the existing array
			else{
				this.data[dict_key].push(location);
			}
		}

		/* otherwise, put the new key in the dictionary and store the new location 
		inside an array in the key's value */
		else{
			this.data[dict_key] = [location];
		}
	
	}

}