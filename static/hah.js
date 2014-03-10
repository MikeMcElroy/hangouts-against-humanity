/* global gapi,angular */
'use strict';

function drawCardFromDeck(getJSONValue, setJSONValue, deckKey) {
  var get = getJSONValue.bind(null, deckKey),
      set = setJSONValue.bind(null, deckKey);

  return function(num) {
    var deck = get(),
        deckLen = deck.length,
        cards = [],
        number = num || 1;

    if(number < deckLen) {
      cards = deck.splice(0, number);
    } else {
      cards = deck;
      deck = [];
    }

    set(deck);
    return cards;
  };
}

angular.module('HangoutsAgainstHumanity', ['ngAnimate', 'ui.bootstrap'])
  .factory('submitDelta', ['$timeout', function($timeout) {
    var next_submit,
        d, r;
    return function(delta, remove) {
      if(!next_submit) {
        d = {};
        r = [];
        next_submit = $timeout(function() {
          gapi.hangout.data.submitDelta(d, r);
          next_submit = undefined;
        }, 20);
      }
      for (var i in delta) {
        d[i] = JSON.stringify(delta[i] || null);
      }
      for (var j in remove) {
        if(r.indexOf(remove[j]) === -1) {
          r.push(remove[j]);
        }
      }
    };
  }])
  .factory('setJSONValue', ['submitDelta', function(submitDelta) {
    return function(key, value) {
      var delta = {};
      delta[key] = value;
      submitDelta(delta);
      return value;
    };
  }])
  .constant('getJSONValue', function(key) { return JSON.parse(gapi.hangout.data.getValue(key) || null); })
  .constant('whiteCardKey', 'white_cards')
  .constant('blackCardKey', 'black_cards')
  .constant('activeBlackCardKey', 'active_black_card')
  .constant('currentReaderKey', 'current_reader')
  .constant('currentStateKey', 'current_state')
  .constant('winnerKey', 'winner')
  .constant('listeningForSubmissionKey', 'listening')
  .constant('shuffle', function(array) {
    var i, j, swapped,
        arrLen = array.length;

    for (i = ((arrLen - 1) * 3); i >= 0; i--) {
      j = Math.floor(Math.random() * arrLen);
      swapped = array[i % arrLen];
      array[i % arrLen] = array[j];
      array[j] = swapped;
    }

    return array;
  })
  .factory('localParticipantId', function() {
    return gapi.hangout.getLocalParticipantId();
  })
  .factory('localParticipantCards', ['localParticipantId', function(localParticipantId) {
    return 'cards_' + localParticipantId;
  }])
  .factory('localParticipantNewCards', ['localParticipantId', function(localParticipantId) {
    return 'new_' + localParticipantId;
  }])
  .factory('drawWhiteCards', ['getJSONValue', 'setJSONValue', 'whiteCardKey', drawCardFromDeck])
  .factory('drawBlackCards', ['getJSONValue', 'setJSONValue', 'blackCardKey', drawCardFromDeck])
  .factory('drawNewQuestion', ['drawBlackCards', 'setJSONValue', 'activeBlackCardKey', function(drawBlackCards, setJSONValue, activeBlackCardKey) {
    return function() {
      return setJSONValue(activeBlackCardKey, drawBlackCards(1)[0]);
    };
  }])
  .factory('submitCards', ['setJSONValue', 'localParticipantCards', 'whiteCards', function(setJSONValue, localParticipantCards, whiteCards) {
    var white;
    whiteCards().then(function(cards) {
      white = cards;
    });
    return function(cards) {
      var cardIds = [], i = 0, len = cards.length;

      for( ; i < len ; i++) {
        cardIds[i] = white.indexOf(cards[i]);
      }

      setJSONValue(localParticipantCards, cardIds);
    };
  }])
  .factory('watchForNewParticipants', [function() {
    return function(callback) {
      var func = function(evt) {
            callback(evt.enabledParticipants);
          },
          cancel = function() {
            gapi.hangout.onParticipantsEnabled.remove(func);
          };

      gapi.hangout.onParticipantsEnabled.add(func);
      return cancel;
    };
  }])
  .factory('watchForSubmittedCards', ['$filter', 'getJSONValue', 'submitDelta', 'listeningForSubmissionKey', 'whiteCards', function($filter, getJSONValue, submitDelta, listeningForSubmissionKey, whiteCards) {
    return function(callback) {
      var func = function(evt) {
            var newCards = $filter('filter')(evt.addedKeys, function(x) {
              return x.key.search('cards_') === 0;
            });
            whiteCards().then(function(white) {
              angular.forEach(newCards, function(obj) {
                obj.value = getJSONValue(obj.key);
                angular.forEach(obj.value, function(cardId, i) {
                  obj.value[i] = white[cardId];
                });
              });
              if(!!newCards.length) {
                callback(newCards);
              }
            });
          },
          cancel = function() {
            gapi.hangout.data.onStateChanged.remove(func);
            delta[listeningForSubmissionKey] = false;
            submitDelta(delta);
          },
          delta = {};

      delta[listeningForSubmissionKey] = true;
      submitDelta(delta);
      gapi.hangout.data.onStateChanged.add(func);

      return cancel;
    };
  }])
  .factory('sendCards', ['submitDelta', 'drawWhiteCards', function(submitDelta, drawWhiteCards) {
    return function(playerIds, cards) {
      var delta = {},
          remove = [],
          newCards = drawWhiteCards(playerIds.length * cards);

      angular.forEach(playerIds, function(p) {
        delta['new_' + p] = newCards.splice(0, cards);
        remove.push('cards_' + p);
      });

      submitDelta(delta, remove);
    };
  }])
  .factory('whiteCards', ['$http', '$q', function($http, $q) {
    var whiteCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/whitecards.json').then(function(response) {
          return (whiteCards = response.data);
        });
    return function() {
      if(!whiteCards) {
        return promise;
      } else {
        return $q.when(whiteCards);
      }
    };
  }])
  .factory('blackCards', ['$http', '$q', function($http, $q) {
    var blackCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/blackcards.json').then(function(response) {
          return (blackCards = response.data);
        });
    return function() {
      if(!blackCards) {
        return promise;
      } else {
        return $q.when(blackCards);
      }
    };
  }])
  .factory('transferToNextPlayer', ['submitDelta', 'currentReaderKey', 'activeBlackCardKey', 'localParticipantId', function(submitDelta, readerKey, activeBlackCardKey, myId) {
    return function() {
      var delta = {},
          participants = gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }).sort(),
          me = participants.indexOf(myId),
          next = (me + 1) % participants.length;

      delta[activeBlackCardKey] = '';
      delta[readerKey] = participants[next];

      submitDelta(delta);
    };
  }])
  .factory('selectWinner', ['submitDelta', 'winnerKey', function(submitDelta, winnerKey) {
    return function(participant) {
      var x = {};

      x[winnerKey] = participant;

      submitDelta(x);
    };
  }])
  .factory('addImageResource', ['$cacheFactory', function($cacheFactory) {
    var canvas = angular.element("<canvas></canvas>")[0],
        context = canvas.getContext('2d'),
        ImageResourceCache = $cacheFactory('imageResources');

    return function(saveAs, creator) {
      var imgRes;
      if(!(imgRes = ImageResourceCache.get(saveAs))) {
        creator(context, canvas);
        imgRes = gapi.hangout.av.effects.createImageResource(canvas.toDataURL());
        ImageResourceCache.put(saveAs, imgRes);
      }

      return imgRes;
    };
  }])
  .constant('buildCard', function(context, canvas, color) {
      var x = 0, y = 0, radius = 30, width = 200, height = 250;
      canvas.setAttribute('height', '250px');
      canvas.setAttribute('width', '200px');
      context.fillStyle = color || 'white';
      context.font = 'bold 20px Helvetica';

      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
      context.fill();
  })
  .factory('showSubmittedCards', ['addImageResource', 'buildCard', function(addImageResource, buildCard) {
    var submittedCardResource = addImageResource('submitted', function(context, canvas) {

      buildCard(context, canvas, 'white');

      context.fillStyle = 'black';
      context.fillText('Hangouts Against', 15, 30);
      context.fillText('Humanity', 15, 60);
    }),
        overlays = [],
        padding = 0.05;


    for (var i = 0; i < 3; i++) {
      overlays.unshift(submittedCardResource.createOverlay({scale: { magnitude: 0.15, reference: gapi.hangout.av.effects.ScaleReference.WIDTH }, position: {x: -0.5 + (padding*i), y: 0.5 - (padding*i)}}));
    }

    return function(number) {
      for (var i = 0; i < 3 ; i++) {
        overlays[i].setVisible(i < number);
      }
    };
  }])
  .factory('showAwesomePoints', ['addImageResource', 'buildCard', function(addImageResource, buildCard) {
    var awesomePointOverlay = addImageResource('awesomePoint', function(context, canvas) {
      buildCard(context, canvas, 'black');

      context.fillStyle = 'white';
      context.fillText('Hangouts Against', 15, 30);
      context.fillText('Humanity', 15, 60);
    }).createOverlay({scale: { magnitude: 0.15, reference: gapi.hangout.av.effects.ScaleReference.WIDTH }, position: { x: 0.23, y: -0.3 }}),
        currentPointOverlay;

    function createNumberImage(number) {
      return function(context, canvas) {
        canvas.setAttribute('height', '60px');
        canvas.setAttribute('width', '100px');
        context.font = 'bold 55px Helvetica';
        context.fillStyle = 'white';

        context.fillText(number.toString(), 15, 58);
      };
    }
    return function(points) {
      if(points <= 0) {
        awesomePointOverlay.setVisible(false);
        if(!!currentPointOverlay && !currentPointOverlay.isDisposed()) {
          currentPointOverlay.dispose();
        }
        return;
      }
      if(!(awesomePointOverlay.isVisible())) {
        awesomePointOverlay.setVisible(true);
      }
      if(points > 1) {
        if(!!currentPointOverlay && !currentPointOverlay.isDisposed()) {
          currentPointOverlay.dispose();
        }
        currentPointOverlay = addImageResource(points.toString(), createNumberImage(points)).showOverlay({
          scale: { magnitude: 0.15, reference: gapi.hangout.av.effects.ScaleReference.WIDTH },
          position: { x: 0.25, y: -0.25}
        });
      }
    };
  }])
  .factory('playSound', [function() {
    function playSound(sound, global) {
      sounds[sound].play({loop: false, global: !!global});
    }

    var sounds = {
          yeah: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/yeah.wav').createSound(),
          boo: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/boo.wav').createSound(),
          cheer: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/cheer.wav').createSound(),
          ready: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/ready-here-we-go.wav').createSound()
        };

    angular.forEach(Object.keys(sounds), function(soundKey) {
      playSound[soundKey.toUpperCase()] = soundKey;
    });

    return playSound;
  }])
  .run(['submitDelta', 'shuffle', 'whiteCardKey', 'blackCardKey', 'currentReaderKey', 'localParticipantId', 'sendCards', 'whiteCards', 'blackCards', '$q',/* Not strictly needed, but we want to fire it off initially with module#run */ 'gameState', function(submitDelta, shuffle, whiteCardKey, blackCardKey, currentReaderKey, localParticipantId, sendCards, whiteCards, blackCards, $q) {

    function saveDeck(cardKey) {
      return function(cardIds) {
        var x = {};
        x[cardKey] = cardIds;
        submitDelta(x);
      };
    }

    function buildDeck(cards) {
      var c = [],
          i = 0, len = cards.length;

      for( ; i < len ; i++) {
        c[i] = i;
      }
      return shuffle(c);
    }

    function ifNotAlreadySaved(cardKey) {
      return function(cards) {
        if (angular.isUndefined(gapi.hangout.data.getValue(cardKey))) {
          return cards;
        } else {
          return $q.reject();
        }
      };
    }

    whiteCards()
      .then(ifNotAlreadySaved(whiteCardKey))
      .then(buildDeck)
      .then(function pullMyCards(cardIds) {
        if(angular.isUndefined(gapi.hangout.data.getValue(currentReaderKey))) {
          var x = {};
          x[currentReaderKey] = localParticipantId;
          submitDelta(x);

          sendCards([ localParticipantId ], 10);
        }
        return cardIds;
      })
      .then(saveDeck(whiteCardKey));

    blackCards()
      .then(ifNotAlreadySaved(blackCardKey))
      .then(buildDeck)
      .then(saveDeck(blackCardKey));

  }])
  .factory('gameState', ['activeBlackCardKey', 'currentReaderKey', 'listeningForSubmissionKey', 'localParticipantNewCards', 'winnerKey', 'getJSONValue', 'whiteCards', 'blackCards', '$rootScope', function(activeBlackCardKey, currentReaderKey, listeningForSubmissionKey, localParticipantNewCards, winnerKey, getJSONValue, whiteCards, blackCards, $rootScope) {
    var item = {},
        white, black;

    whiteCards().then(function(cards) {
      var newCards = getJSONValue(localParticipantNewCards);
      item.newCards = [];
      if (angular.isArray(newCards)) {
        angular.forEach(newCards, function(cardId, i) {
          item.newCards[i] = cards[cardId];
        });
      }
      return cards;
    }).then(function(cards) {
      white = cards;
    });
    blackCards().then(function(cards) {
      var activeQuestion = getJSONValue(activeBlackCardKey);
      item.activeQuestion = cards[activeQuestion || ''] || { text: '' };
      return cards;
    }).then(function(cards) {
      black = cards;
    });
    item.currentReader = getJSONValue(currentReaderKey);
    item.canSubmit = getJSONValue(listeningForSubmissionKey);
    item.winner = getJSONValue(winnerKey);

    gapi.hangout.data.onStateChanged.add(
      function(evt) {
        var questionChange,
            readerChange,
            canSubmit,
            newCards,
            winner;

        questionChange = readerChange = canSubmit = newCards = winner = false;

        angular.forEach(evt.addedKeys, function(v) {
          questionChange = (v.key === activeBlackCardKey ? true : questionChange);
          readerChange = (v.key === currentReaderKey ? true : readerChange);
          canSubmit = (v.key === listeningForSubmissionKey ? true : canSubmit);
          newCards = (v.key === localParticipantNewCards ? true : newCards);
          winner = (v.key === winnerKey ? true : winner);
        });

        if(questionChange || readerChange || canSubmit || newCards || winner) {
          item.activeQuestion = (questionChange ? black[getJSONValue(activeBlackCardKey)] : item.activeQuestion);
          item.currentReader = (readerChange ? getJSONValue(currentReaderKey) : item.currentReader);
          item.canSubmit = (canSubmit ? getJSONValue(listeningForSubmissionKey) : item.canSubmit);
          if(winner) {
            item.winner = (winner ? getJSONValue(winnerKey) : item.winner);
            gapi.hangout.data.clearValue(winnerKey);
          }
          if(newCards) {
            item.newCards = [];
            angular.forEach(getJSONValue(localParticipantNewCards), function(c, i) {
              item.newCards[i] = white[c];
            });
            gapi.hangout.data.clearValue(localParticipantNewCards);
          }
          $rootScope.$apply();
        }
      });
    return item;
  }])
  .controller('TableCtrl', ['$scope', '$sce', 'gameState', 'localParticipantId', 'submitCards', 'watchForSubmittedCards', 'drawNewQuestion', 'watchForNewParticipants', 'transferToNextPlayer', 'sendCards', 'playSound', 'showSubmittedCards', 'showAwesomePoints', 'selectWinner', function($scope, $sce, gameState, localParticipantId, submitCards, watchForSubmittedCards, drawNewQuestion, watchForNewParticipants, transferToNextPlayer, sendCards, playSound, showSubmittedCards, showAwesomePoints, selectWinner) {
    var cancelReader,
        cancelNewParticipantsWatch,
        blankCard = { text: '' };

    function ChangeOfActiveQuestion() {
      return gameState.activeQuestion;
    }

    function AmICurrentReader() {
      return gameState.currentReader === localParticipantId;
    }

    function CanSubmit() {
      return gameState.canSubmit;
    }

    function NewCardsDealt() {
      return gameState.newCards;
    }

    function AmIWinner() {
      return gameState.winner === localParticipantId;
    }

    $scope.hand = [];
    $scope.submittedCards = [];

    $scope.selectCard = function(index) {
      var card = $scope.hand.splice(index, 1)[0];
      $scope.submittedCards.push(card);
    };

    $scope.unselectCard = function(index) {
      var card = $scope.submittedCards.splice(index, 1)[0];
      $scope.hand.push(card);
    };

    $scope.disableSubmit = false;
    $scope.submitCards = function(cards) {
      submitCards(cards);
      showSubmittedCards(cards.length);
      $scope.submittedCards = [];
      $scope.disableSubmit = true;
    };

    $scope.isReader = false;

    $scope.$watch(ChangeOfActiveQuestion, function(newVal) {
      $scope.disableSubmit = !newVal;
      $scope.question = (!!newVal ? newVal : blankCard);
      $scope.question.text = $sce.trustAsHtml($scope.question.text);
    });

    $scope.$watch(AmICurrentReader, function(newVal) {
      $scope.isReader = newVal;
      if(newVal) {
        $scope.submittedPlayers = [];
        $scope.disableDrawQuestion = false;
        $scope.disableShowAnswers = true;
        $scope.disableMoveToNext = true;
        $scope.disableSelectWinner = true;

        cancelNewParticipantsWatch = watchForNewParticipants(function(participants) {
          sendCards(participants.map(function(p) { return p.id; }), 10);
        });
      }
    });

    $scope.$watch(CanSubmit, function(newVal) {
      if(!!newVal) {
        $scope.disableSubmit = false;
      } else {
        showSubmittedCards(0);
        $scope.disableSubmit = true;
      }
    });

    $scope.$watch(NewCardsDealt, function(newVal) {
      if(angular.isArray(newVal)) {
        $scope.hand = $scope.hand.concat(newVal);
      }
    });

    var points = 0;
    $scope.$watch(AmIWinner, function(newVal) {
      if(newVal) {
        showAwesomePoints(++points);
      }
    });

    /* Dealer-specific */
    $scope.moveToNext = function() {

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = true;
      $scope.disableSelectWinner = true;

      transferToNextPlayer();
      sendCards($scope.submittedPlayers.map(function(p) { return p.player; }), $scope.question.pick - $scope.question.draw );

      cancelNewParticipantsWatch();
    };

    $scope.showAnswers = function() {
      cancelReader();

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = true;
      $scope.disableSelectWinner = false;
    };

    $scope.winner = function(index) {
      $scope.winner = index;
    };

    $scope.selectWinner = function() {
      selectWinner($scope.submittedPlayers[$scope.winner].player);
      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = false;
      $scope.disableSelectWinner = true;
    };

    $scope.drawNewQuestion = function() {
      var newQuestion = drawNewQuestion();
      $scope.submittedPlayers = [];
      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = false;
      $scope.disableMoveToNext = true;
      $scope.disableSelectWinner = true;
      if("0" !== newQuestion.draw) {
        sendCards(gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }), newQuestion.draw);
      }

      cancelReader = watchForSubmittedCards(function(newSubmissions) {
        angular.forEach(newSubmissions, function(submission) {
          $scope.submittedPlayers.push({
              player: submission.lastWriter,
              cards: submission.value
          });
        });
        if($scope.submittedPlayers.length === gapi.hangout.getEnabledParticipants().length - 1) {
          playSound(playSound.READY, false);
        }
      });
    };
  }]);
